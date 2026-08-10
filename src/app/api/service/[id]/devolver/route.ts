import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { registrarQuebra, buscarOuroRecebido } from "@/lib/registrar-quebra";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const DevolverServicoSchema = z.object({
  peso_saida: z.coerce.number().positive(),
  foto_peca_base64: z.string().min(1, "obrigatório"),
  usou_solda: z.boolean(),
  peso_fio_depois: z.coerce.number().nullable().optional(),
  foto_fio_base64: z.string().nullable().optional(),
}).passthrough();

// POST /api/service/[id]/devolver
// Operador service devolve a peça para o POTE (Almoxarifado ID=1).
// Só disponível para serviços com transferencia_service_id (veio de transferência fábrica).
// Cria protocolo de volta para motoboy buscar.
//
// Auth: is_operador_service = true OU fullAccess
// Body: { peso_saida, foto_peca_base64, usou_solda, peso_fio_depois?, foto_fio_base64? }

function extrairMediaType(base64: string): string {
  if (base64.startsWith("data:image/png"))  return "image/png";
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
  } catch (err) {
    return internalError("[POST /api/service/[id]/devolver]", err);
  }
}

async function _handler(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const { id } = await params;
  const servicoId = parseInt(id);
  if (isNaN(servicoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role, deposito_id, is_operador_service
    FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const hasAccess = isFullAccess(caller.role as string) || caller.is_operador_service === true;
  if (!hasAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = DevolverServicoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { peso_saida, foto_peca_base64, usou_solda, peso_fio_depois, foto_fio_base64 } = parsed.data;
  if (usou_solda && (peso_fio_depois == null || peso_fio_depois < 0)) {
    return NextResponse.json({ error: "peso_fio_depois é obrigatório quando usou_solda=true" }, { status: 400 });
  }
  if (usou_solda && !foto_fio_base64) {
    return NextResponse.json({ error: "foto_fio_base64 é obrigatória quando usou_solda=true" }, { status: 400 });
  }

  // 1. Buscar serviço — validar que veio de transferência service
  const [servico] = await sql`
    SELECT s.*, o.numero_ordem, d.nome AS deposito_nome
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    LEFT JOIN alissonerp.depositos d ON d.id = s.operador_id
    WHERE s.id = ${servicoId}::integer
  `;
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  if (!servico.transferencia_service_id) {
    return NextResponse.json(
      { error: "Este serviço não veio de transferência de fábrica. Use Concluir." },
      { status: 422 }
    );
  }
  if (servico.status !== "em_servico") {
    return NextResponse.json(
      { error: `Serviço está com status '${servico.status}' — só pode devolver 'em_servico'` },
      { status: 422 }
    );
  }

  const operadorId   = servico.operador_id   as number;
  const ordemId      = servico.ordem_id      as number;
  const pcpId        = servico.pcp_id        as number | null;
  const transfId     = servico.transferencia_service_id as number;
  const numeroOrdem  = servico.numero_ordem  as string;
  const depositoNome = servico.deposito_nome as string;
  const userId       = user.id;

  // 2. IA valida peso da peça
  const mediaTypePeca = extrairMediaType(foto_peca_base64);
  const base64Peca    = extrairBase64Puro(foto_peca_base64);
  const validacaoPeca = await validarPesoBalanca(base64Peca, mediaTypePeca, peso_saida, "metal");
  if (!validacaoPeca.match) {
    return NextResponse.json(
      { error: `Peso da peça não confirmado pela IA: ${validacaoPeca.mensagem}` },
      { status: 422 }
    );
  }

  // 3. Upload foto da peça
  const fotoPecaPath = `service/${servicoId}/devolucao-${Date.now()}.jpg`;
  const fotoPecaResult = await uploadFile("service-fotos", fotoPecaPath, foto_peca_base64, mediaTypePeca);
  if ("error" in fotoPecaResult) {
    return NextResponse.json(
      { error: `Erro no upload da foto: ${(fotoPecaResult as { error: string }).error}` },
      { status: 500 }
    );
  }
  const fotoPecaUrl = (fotoPecaResult as { url: string }).url;

  // 4. Processar solda (se usada)
  let pesoFioAntes = 0;
  let consumoSolda = 0;
  let fotoFioUrl: string | null = null;

  if (usou_solda && peso_fio_depois != null) {
    const mediaTypeFio = extrairMediaType(foto_fio_base64!);
    const base64Fio    = extrairBase64Puro(foto_fio_base64!);
    const validacaoFio = await validarPesoBalanca(base64Fio, mediaTypeFio, peso_fio_depois, "metal");
    if (!validacaoFio.match) {
      return NextResponse.json(
        { error: `Peso do aditivo não confirmado pela IA: ${validacaoFio.mensagem}` },
        { status: 422 }
      );
    }

    const fioPath = `service/${servicoId}/fio-devolucao-${Date.now()}.jpg`;
    const fioResult = await uploadFile("service-fotos", fioPath, foto_fio_base64!, mediaTypeFio);
    if ("error" in fioResult) {
      return NextResponse.json(
        { error: `Erro no upload da foto do fio: ${(fioResult as { error: string }).error}` },
        { status: 500 }
      );
    }
    fotoFioUrl = (fioResult as { url: string }).url;

    const ouro18kId = await getParametroNumber(PARAM.OURO_18K_INSUMO_ID);
    const [saldoRow] = await sql`
      SELECT COALESCE(saldo, 0) AS saldo
      FROM alissonerp.vw_saldo_estoque
      WHERE deposito_id = ${operadorId}::integer AND insumo_id = ${ouro18kId}
    `;
    pesoFioAntes = parseFloat(String(saldoRow?.saldo ?? 0));
    consumoSolda = parseFloat((pesoFioAntes - peso_fio_depois).toFixed(4));

    if (consumoSolda < 0) {
      return NextResponse.json(
        { error: `Consumo de solda inválido: peso_fio_depois (${peso_fio_depois}g) > saldo atual (${pesoFioAntes}g)` },
        { status: 422 }
      );
    }
  }

  // 5. Calcular ouro a devolver (saldo líquido do operador para esta ordem)
  //    Chamado ANTES de criar CEs para evitar double-counting
  const almoxarifadoId   = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
  const ouro18kId        = await getParametroNumber(PARAM.OURO_18K_INSUMO_ID);
  const localEstoqueDefault = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);
  const ouroRecebido = await buscarOuroRecebido(ordemId, operadorId);
  const ouroDevolver = Math.max(0, parseFloat(ouroRecebido.toFixed(4)));

  // 6. Transação
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultado = await (sql as any).begin(async (tx: typeof sql) => {
    // 6a. Consumo solda (SM)
    if (usou_solda && consumoSolda > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, observacao, ordem_id, created_by, local_estoque_id)
        VALUES
          (${ouro18kId}, ${operadorId}::integer, ${consumoSolda}::real, 0,
           'SM'::alissonerp.enum_marcador_estoque,
           ${'Consumo aditivo devolucao service #' + servicoId + ' - ' + numeroOrdem},
           ${ordemId}::integer, ${userId}::uuid, ${localEstoqueDefault})
      `;
    }

    // 6b. Mover ouro de volta para o POTE (dep=1)
    //     REGRA INVIOLÁVEL: deposito_id = 1, NÃO deposito_origem
    if (ouroDevolver > 0) {
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, observacao, ordem_id, created_by, local_estoque_id)
        VALUES
          (${ouro18kId}, ${operadorId}::integer, ${ouroDevolver}::real, 0,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Devolucao service #' + servicoId + ' ao pote - ' + numeroOrdem},
           ${ordemId}::integer, ${userId}::uuid, ${localEstoqueDefault})
      `;
      await tx`
        INSERT INTO alissonerp.movimentacoes_estoque
          (insumo_id, deposito_id, saida, entrada, marcador, observacao, ordem_id, created_by, local_estoque_id)
        VALUES
          (${ouro18kId}, ${almoxarifadoId}, 0, ${ouroDevolver}::real,
           'TED'::alissonerp.enum_marcador_estoque,
           ${'Devolucao service #' + servicoId + ' ao pote - ' + numeroOrdem},
           ${ordemId}::integer, ${userId}::uuid, ${localEstoqueDefault})
      `;
    }

    // 6c. Registrar quebra do operador service
    //     ouro_recebido = ouroRecebido (calculado antes das CEs)
    //     ouro_entregue = ouroDevolver (o que está sendo devolvido)
    if (ouroRecebido > 0) {
      await registrarQuebra({
        ordem_id:      ordemId,
        pcp_id:        pcpId ?? null,
        deposito_id:   operadorId,
        setor_id:      null,
        numero_ordem:  numeroOrdem,
        deposito_nome: depositoNome,
        setor_nome:    null,
        tipo:          "devolucao_service",
        ouro_recebido: ouroRecebido,
        ouro_entregue: ouroDevolver,
        created_by:    userId,
      });

      // CE de baixa do residual (se houver quebra)
      const quebraService = parseFloat((ouroRecebido - ouroDevolver).toFixed(4));
      if (quebraService > 0) {
        await tx`
          INSERT INTO alissonerp.movimentacoes_estoque
            (insumo_id, deposito_id, saida, marcador, ordem_id, observacao, created_at, local_estoque_id)
          VALUES
            (1, ${operadorId}::integer, ${quebraService}::real,
             'QUEBRA_PCP'::alissonerp.enum_marcador_estoque,
             ${ordemId}::integer,
             ${'Quebra devolucao service #' + servicoId},
             NOW(), 1)
        `;
      }
    }

    // 6d. Criar protocolo de volta (motoboy busca a peça)
    const [protoVolta] = await tx`
      INSERT INTO alissonerp.protocolos
        (direcao, etapas, tipo_protocolo, created_by)
      VALUES
        ('volta'::alissonerp.enum_direcao_protocolo,
         'pendente'::alissonerp.enum_etapas_protocolo,
         'fabrica', ${userId}::uuid)
      RETURNING id
    `;
    const protocoloVoltaId = protoVolta.id as number;

    await tx`
      INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id)
      VALUES (${protocoloVoltaId}::integer, ${ordemId}::integer)
    `;

    // 6e. Atualizar transferencia com info de devolução
    await tx`
      UPDATE alissonerp.transferencias_ordem
      SET observacao = COALESCE(observacao, '') || ' | Devolvido ao pote em ' || NOW()::date
      WHERE id = ${transfId}::integer
    `;

    // 6f. UPDATE servicos
    await tx`
      UPDATE alissonerp.servicos
      SET peso_saida     = ${peso_saida}::numeric,
          usou_solda     = ${usou_solda},
          peso_fio_antes = ${usou_solda ? pesoFioAntes : null}::numeric,
          peso_fio_depois= ${usou_solda ? (peso_fio_depois ?? null) : null}::numeric,
          consumo_solda  = ${usou_solda ? consumoSolda : null}::numeric,
          foto_conclusao = ${fotoPecaUrl},
          foto_fio_solda = ${fotoFioUrl ?? null},
          status         = 'devolvido',
          concluido_em   = NOW(),
          concluido_por  = ${userId}::uuid
      WHERE id = ${servicoId}::integer
    `;

    return { protocolo_volta_id: protocoloVoltaId };
  });

  return NextResponse.json({
    success: true,
    servico_id:        servicoId,
    protocolo_volta_id: resultado.protocolo_volta_id,
    ouro_devolvido:    parseFloat(ouroDevolver.toFixed(2)),
  });
}
