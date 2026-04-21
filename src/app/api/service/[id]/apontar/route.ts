import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// POST /api/service/[id]/apontar
// Operador registra consumo de insumo (fecho, corrente, etc.) em um serviço em andamento,
// sem precisar concluir a ordem. Gera saída avulsa (SA) no estoque do operador.
// Auth: is_operador_service = true OU fullAccess

function extrairMediaType(base64: string): string {
  if (base64.startsWith("data:image/png"))  return "image/png";
  if (base64.startsWith("data:image/webp")) return "image/webp";
  return "image/jpeg";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const servicoId = parseInt(id);
    if (isNaN(servicoId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const [caller] = await sql`
      SELECT role, deposito_id, is_operador_service, nome
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
    `;
    if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

    const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
    if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const body = await req.json().catch(() => null) as {
      insumo_id?: number;
      quantidade?: number;
      foto_base64?: string;
      obs?: string;
    } | null;

    const insumoId   = body?.insumo_id  ? parseInt(String(body.insumo_id))     : null;
    const quantidade = body?.quantidade ? parseFloat(String(body.quantidade))   : null;
    const fotoBase64 = body?.foto_base64 ?? null;
    const obs        = body?.obs ?? null;

    if (!insumoId || isNaN(insumoId)) {
      return NextResponse.json({ error: "insumo_id obrigatório" }, { status: 400 });
    }
    if (!quantidade || isNaN(quantidade) || quantidade <= 0) {
      return NextResponse.json({ error: "quantidade deve ser > 0" }, { status: 400 });
    }
    if (!fotoBase64) {
      return NextResponse.json({ error: "foto_base64 obrigatória" }, { status: 400 });
    }

    // ── 1. Verificar serviço ──────────────────────────────────────────────────
    const [servico] = await sql`
      SELECT id, operador_id, status
      FROM alissonerp.servicos
      WHERE id = ${servicoId}
    `;
    if (!servico) {
      return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
    }
    if (servico.status !== "em_servico") {
      return NextResponse.json(
        { error: `Serviço está '${servico.status}' — só pode apontar em 'em_servico'` },
        { status: 422 }
      );
    }

    const operadorId = (servico.operador_id ?? caller.deposito_id ?? null) as number | null;
    if (!operadorId) {
      return NextResponse.json({ error: "Serviço sem operador vinculado" }, { status: 422 });
    }

    // ── 2. Verificar saldo do insumo ──────────────────────────────────────────
    const saldoRows = await sql`
      SELECT COALESCE(SUM(saldo), 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${operadorId}
        AND insumo_id   = ${insumoId}
    `;
    const saldoAtual = parseFloat(String(saldoRows[0]?.saldo ?? 0));
    if (saldoAtual < quantidade) {
      return NextResponse.json(
        { error: `Saldo insuficiente. Disponível: ${saldoAtual.toFixed(4)}, solicitado: ${quantidade.toFixed(4)}` },
        { status: 422 }
      );
    }

    // ── 3. Buscar nome do insumo e local_estoque do depósito ──────────────────
    const [insumo] = await sql`SELECT nome FROM alissonerp.insumos WHERE id = ${insumoId}`;
    if (!insumo) {
      return NextResponse.json({ error: "Insumo não encontrado" }, { status: 404 });
    }

    const [deposito] = await sql`
      SELECT local_estoque_id FROM alissonerp.depositos WHERE id = ${operadorId}
    `;
    const localEstoqueId = (deposito?.local_estoque_id ?? 3) as number;

    // ── 4. Upload da foto ─────────────────────────────────────────────────────
    const mediaType = extrairMediaType(fotoBase64);
    const fotoPath  = `service/${servicoId}/aponto-${insumoId}-${Date.now()}.jpg`;
    const fotoResult = await uploadFile("service-fotos", fotoPath, fotoBase64, mediaType);
    if ("error" in fotoResult) {
      return NextResponse.json({ error: `Erro no upload da foto: ${fotoResult.error}` }, { status: 500 });
    }

    // ── 5. Registrar saída avulsa + apontamento em transação ──────────────────
    const operadorNome = (caller.nome ?? "operador") as string;

    const result = await (sql as unknown as { begin: (fn: (tx: typeof sql) => Promise<{ movId: number; apontoId: number }>) => Promise<{ movId: number; apontoId: number }> }).begin(async (tx) => {
      // Saída Avulsa do estoque do operador
      const [mov] = await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, obs, data_hora)
        VALUES (
          ${insumoId},
          ${operadorId},
          ${localEstoqueId},
          0,
          ${quantidade},
          'SA',
          ${obs ?? `Aponto serviço #${servicoId} — ${insumo.nome}`},
          NOW()
        )
        RETURNING id
      `;

      // Registro do apontamento
      const [aponto] = await tx`
        INSERT INTO alissonerp.apontamentos_servico
          (servico_id, operador_id, operador_nome, insumo_id, insumo_nome, quantidade, movimentacao_id, foto_url, obs)
        VALUES (
          ${servicoId},
          ${operadorId},
          ${operadorNome},
          ${insumoId},
          ${insumo.nome as string},
          ${quantidade},
          ${mov.id as number},
          ${fotoResult.url},
          ${obs ?? null}
        )
        RETURNING id
      `;

      return { movId: mov.id as number, apontoId: aponto.id as number };
    });

    // ── 6. Saldo atualizado ───────────────────────────────────────────────────
    const novoSaldoRows = await sql`
      SELECT COALESCE(SUM(saldo), 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${operadorId}
        AND insumo_id   = ${insumoId}
    `;
    const novoSaldo = parseFloat(parseFloat(String(novoSaldoRows[0]?.saldo ?? 0)).toFixed(4));

    return NextResponse.json({
      success:        true,
      apontamento_id: result.apontoId,
      movimentacao_id: result.movId,
      foto_url:       fotoResult.url,
      novo_saldo:     novoSaldo,
    });
  } catch (err: unknown) {
    const e = err as Error;
    console.error("[service/apontar] ERRO:", e?.message);
    return NextResponse.json(
      { error: e?.message ?? "Erro desconhecido" },
      { status: 500 }
    );
  }
}
