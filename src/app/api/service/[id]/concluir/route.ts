import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// POST /api/service/[id]/concluir
// Operador conclui o serviço: registra pesos, solda, pedras, fotos.
// Auth: is_operador_service = true OU fullAccess

interface PedraMaterial {
  insumo_id: number;
  nome?: string;
  qtd: number;
  peso_unitario: number;
  peso_total: number;
  origem: "estoque" | "cliente";
}

function extrairMediaType(base64: string): string {
  if (base64.startsWith("data:image/png")) return "image/png";
  if (base64.startsWith("data:image/webp")) return "image/webp";
  return "image/jpeg";
}

function extrairBase64Puro(base64: string): string {
  return base64.replace(/^data:[^;]+;base64,/, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await _handler(req, params);
  } catch (err: unknown) {
    const e = err as Error;
    console.error("[service/concluir] ERRO NÃO CAPTURADO:", e?.message, e?.stack);
    return NextResponse.json(
      { error: e?.message ?? "Erro desconhecido", hint: e?.stack?.split("\n")[1]?.trim() },
      { status: 500 }
    );
  }
}

async function _handler(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const { id } = await params;
  const servicoId = parseInt(id);
  if (isNaN(servicoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, deposito_id, is_operador_service
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = await req.json() as {
    peso_saida: number;
    foto_peca_base64: string;
    usou_solda: boolean | null;
    peso_fio_depois?: number | null;
    foto_fio_base64?: string | null;
    colocou_pedra?: boolean;
    pedras_colocadas?: PedraMaterial[];
  };

  const {
    peso_saida,
    foto_peca_base64,
    usou_solda,
    peso_fio_depois,
    foto_fio_base64,
    colocou_pedra = false,
    pedras_colocadas = [],
  } = body;

  if (peso_saida == null || peso_saida <= 0) {
    return NextResponse.json({ error: "peso_saida é obrigatório e deve ser > 0" }, { status: 400 });
  }
  if (!foto_peca_base64) {
    return NextResponse.json({ error: "foto_peca_base64 é obrigatória" }, { status: 400 });
  }
  if (usou_solda === null || usou_solda === undefined) {
    return NextResponse.json({ error: "usou_solda é obrigatório (true ou false)" }, { status: 400 });
  }
  if (usou_solda && (peso_fio_depois == null || peso_fio_depois < 0)) {
    return NextResponse.json({ error: "peso_fio_depois é obrigatório quando usou_solda=true" }, { status: 400 });
  }
  if (usou_solda && !foto_fio_base64) {
    return NextResponse.json({ error: "foto_fio_base64 é obrigatória quando usou_solda=true" }, { status: 400 });
  }

  // ── 1. Buscar serviço ─────────────────────────────────────────────────────
  const [servico] = await sql`
    SELECT s.*, o.numero_ordem
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    WHERE s.id = ${servicoId}
  `;
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  if (servico.status !== "em_servico") {
    return NextResponse.json(
      { error: `Serviço está com status '${servico.status}' — só pode concluir 'em_servico'` },
      { status: 422 }
    );
  }

  const operadorId  = (servico.operador_id  ?? null) as number | null;
  const ordemId     = (servico.ordem_id     ?? null) as number | null;
  const pcpId       = (servico.pcp_id       ?? null) as number | null;
  const numeroOrdem = (servico.numero_ordem ?? "") as string;
  const userId      = user.id ?? null;

  // ── 2. IA valida peso da peça ─────────────────────────────────────────────
  const mediaTypePeca = extrairMediaType(foto_peca_base64);
  const base64Peca    = extrairBase64Puro(foto_peca_base64);
  const validacaoPeca = await validarPesoBalanca(base64Peca, mediaTypePeca, peso_saida, "metal");
  if (!validacaoPeca.match) {
    return NextResponse.json(
      { error: `Peso da peça não confirmado pela IA: ${validacaoPeca.mensagem}` },
      { status: 422 }
    );
  }

  // ── 3. Upload foto da peça ────────────────────────────────────────────────
  const fotoPath = `service/${servicoId}/conclusao-${Date.now()}.jpg`;
  const fotoResult = await uploadFile("service-fotos", fotoPath, foto_peca_base64, mediaTypePeca);
  if ("error" in fotoResult) {
    return NextResponse.json({ error: `Erro no upload da foto da peça: ${fotoResult.error}` }, { status: 500 });
  }
  const fotoUrl = fotoResult.url;

  // ── 4. Processar solda ────────────────────────────────────────────────────
  let pesoFioAntes    = 0;
  let consumoSolda    = 0;
  let fotoFioUrl: string | null = null;

  if (usou_solda && peso_fio_depois != null) {
    // 4a. IA valida peso do fio
    const mediaTypeFio = extrairMediaType(foto_fio_base64!);
    const base64Fio    = extrairBase64Puro(foto_fio_base64!);
    const validacaoFio = await validarPesoBalanca(base64Fio, mediaTypeFio, peso_fio_depois, "metal");
    if (!validacaoFio.match) {
      return NextResponse.json(
        { error: `Peso do fio de solda não confirmado pela IA: ${validacaoFio.mensagem}` },
        { status: 422 }
      );
    }

    // 4b. Upload foto do fio
    const fioPath = `service/${servicoId}/fio-solda-${Date.now()}.jpg`;
    const fioResult = await uploadFile("service-fotos", fioPath, foto_fio_base64!, mediaTypeFio);
    if ("error" in fioResult) {
      return NextResponse.json({ error: `Erro no upload da foto do fio: ${fioResult.error}` }, { status: 500 });
    }
    fotoFioUrl = fioResult.url;

    // 4c. Buscar saldo atual do fio (Ouro 18k = insumo_id=1) no depósito do operador
    const [saldoRow] = await sql`
      SELECT COALESCE(saldo, 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${operadorId} AND insumo_id = 1
    `;
    pesoFioAntes = parseFloat(String(saldoRow?.saldo ?? 0));

    // 4d. Calcular consumo
    consumoSolda = parseFloat((pesoFioAntes - peso_fio_depois).toFixed(4));

    if (consumoSolda < 0) {
      return NextResponse.json(
        { error: `Consumo de solda inválido: peso_fio_depois (${peso_fio_depois}g) > saldo atual (${pesoFioAntes}g)` },
        { status: 422 }
      );
    }
    if (consumoSolda > pesoFioAntes) {
      return NextResponse.json(
        { error: `Consumo de solda (${consumoSolda}g) excede saldo disponível (${pesoFioAntes}g)` },
        { status: 422 }
      );
    }
  }

  // ── 5. Gravar tudo em transação ───────────────────────────────────────────
  console.log("[concluir] vars pré-tx:", {
    servicoId, ordemId, pcpId, operadorId, userId,
    peso_saida, usou_solda, pesoFioAntes, consumoSolda,
    peso_fio_depois: peso_fio_depois ?? null,
    colocou_pedra, pedras_count: pedras_colocadas.length,
    fotoUrl: !!fotoUrl, fotoFioUrl: !!fotoFioUrl,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // 5a. Movimentação de consumo de solda (SM = Saída Metal do depósito do operador)
    if (usou_solda && consumoSolda > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, obs, data_hora, valor_total, preco_compra, created_by, ordem_id, local_estoque_id)
        VALUES
          (1, ${operadorId}, ${consumoSolda}::real, 0,
           'SM'::alissonerp.enum_marcador_estoque,
           ${'Consumo solda serviço #' + servicoId + ' - ordem ' + numeroOrdem},
           NOW(), 0, 0, ${userId}::uuid, ${ordemId}, 1)
      `;
    }

    // 5b. Movimentações de pedras (SP = Saída Pedra, apenas origem='estoque')
    for (const pedra of pedras_colocadas) {
      if (pedra.origem === "estoque" && pedra.qtd > 0 && pedra.insumo_id) {
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, saida, entrada, marcador, obs, data_hora, valor_total, preco_compra, created_by, ordem_id, local_estoque_id)
          VALUES
            (${pedra.insumo_id}, ${operadorId}, ${pedra.peso_total ?? 0}::real, 0,
             'SP'::alissonerp.enum_marcador_estoque,
             ${'Pedra serviço #' + servicoId + ' - ordem ' + numeroOrdem},
             NOW(), 0, 0, ${userId}::uuid, ${ordemId}, 1)
        `;
      }
    }

    // 5c. UPDATE servicos
    await tx`
      UPDATE alissonerp.servicos
      SET peso_saida       = ${peso_saida}::numeric,
          usou_solda       = ${usou_solda},
          peso_fio_antes   = ${usou_solda ? pesoFioAntes : null}::numeric,
          peso_fio_depois  = ${usou_solda ? (peso_fio_depois ?? null) : null}::numeric,
          consumo_solda    = ${usou_solda ? consumoSolda : null}::numeric,
          colocou_pedra    = ${colocou_pedra},
          pedras_colocadas = ${JSON.stringify(pedras_colocadas)}::jsonb,
          foto_conclusao   = ${fotoUrl},
          foto_fio_solda   = ${fotoFioUrl ?? null},
          status           = 'concluido',
          concluido_em     = NOW(),
          concluido_por    = ${userId}::uuid
      WHERE id = ${servicoId}
    `;

    // 5d. UPDATE pcp
    if (pcpId) {
      await tx`
        UPDATE alissonerp.pcp
        SET etapas         = 'concluido'::alissonerp.enum_etapas_pcp,
            peso_final     = ${peso_saida}::real,
            data_conclusao = NOW(),
            updated_at     = NOW()
        WHERE id = ${pcpId}
      `;
    }

    // 5e. UPDATE ordens
    await tx`
      UPDATE alissonerp.ordens
      SET status         = 'concluido'::alissonerp.enum_status_ordem,
          data_conclusao = NOW(),
          updated_at     = NOW()
      WHERE id = ${ordemId}
    `;

    // 5f. INSERT auditoria fábrica — já aprovada para liberar protocolo de volta imediatamente
    await tx`
      INSERT INTO alissonerp.auditorias
        (ordem_id, tipo_auditoria, situacao, rota_processo, parecer, created_at)
      VALUES
        (${ordemId}, 'fabrica', 'aprovado', 'saida_pcp', 'Aprovação automática — módulo Service', NOW())
    `;
  });

  return NextResponse.json({
    success:      true,
    servico_id:   servicoId,
    peso_saida:   parseFloat(peso_saida.toFixed(2)),
    consumo_solda: usou_solda ? parseFloat(consumoSolda.toFixed(4)) : 0,
  });
}

