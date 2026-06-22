import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { internalError } from "@/lib/api-error";

// Bucket privado das fotos da chegada (balanca + pecas). Ver isPrivateBucket em storage-url.ts.
const BUCKET_CHEGADA = "compras-comercial-fotos";
const TOLERANCIA_PADRAO_G = 0.3;

// REGRA DE NEGOCIO:
// - O que faz: schema da CHEGADA (primeira etapa). Recebe o lote (pecas/peso/valor), o plano
//   financeiro e as 2 fotos obrigatorias (balanca + pecas) em base64.
// - Por que: o metal precisa ser rastreado ao chegar na loja, antes do cadastro peca a peca.
// - Impacto se alterado/removido: chegada perde dados de lote/foto e a rastreabilidade some.
const ChegadaPostSchema = z.object({
  fornecedor_id: z.coerce.number().int().nullable().optional(),
  obs: z.string().nullable().optional(),
  local_estoque_id: z.coerce.number().int().positive(),
  numero_nf: z.string().nullable().optional(),
  data_compra: z.string().nullable().optional(),
  qtd_parcelas: z.coerce.number().int().min(1),
  primeiro_vencimento: z.string(),
  // Dados do lote da chegada
  total_pecas: z.coerce.number().int().positive(),
  peso_total_g: z.coerce.number().positive(),
  valor_total: z.coerce.number().positive(),
  // Fotos obrigatorias (base64 sem prefixo data:)
  foto_balanca_base64: z.string().min(1, "Foto da balança é obrigatória"),
  foto_balanca_media_type: z.string().optional(),
  foto_pecas_base64: z.string().min(1, "Foto das peças é obrigatória"),
  foto_pecas_media_type: z.string().optional(),
}).passthrough();

const NUM_FIELDS = ["total", "total_itens", "total_pecas", "peso_total_g", "valor_total_lote", "valor_grama", "ia_peso_balanca", "qtd_parcelas", "local_estoque_id", "fornecedor_id"];

// REGRA DE NEGOCIO:
// - O que faz: lista compras comerciais com fornecedor/local e total de itens.
// - Por que: a operacao precisa acompanhar status e totais sem consultar varias telas.
// - Impacto se alterado/removido: dashboard de compras comerciais perde rastreabilidade.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const situacaoFilter = req.nextUrl.searchParams.get("situacao");
  const localIdFilter = req.nextUrl.searchParams.get("local_id");

  const rows = await sql`
    SELECT c.*,
      ct.nome AS fornecedor_nome,
      le.nome AS local_nome,
      COUNT(ic.id)::int AS total_itens,
      u.nome AS recebido_por_nome
    FROM alissonerp.compras_comercial c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_estoque_id
    LEFT JOIN alissonerp.itens_compra_comercial ic ON ic.compra_comercial_id = c.id
    LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
    WHERE (${situacaoFilter}::text IS NULL OR c.situacao = ${situacaoFilter})
      AND (${localIdFilter}::int IS NULL OR c.local_estoque_id = ${localIdFilter ? parseInt(localIdFilter) : null})
    GROUP BY c.id, ct.nome, le.nome, u.nome
    ORDER BY c.id DESC
  `;

  const normalized = rows.map((r) =>
    normalizeRow(r as Record<string, unknown>, NUM_FIELDS, [])
  );
  return NextResponse.json(normalized);
}

// REGRA DE NEGOCIO:
// - O que faz: CHEGADA — cria a compra ja com o lote, calcula o valor da grama, sobe as 2 fotos,
//   roda a IA na foto da balanca (confere peso x informado) e nasce em 'recebido_pendente_cadastro'.
//   A conta a pagar do lote e gerada por trigger (fn_gerar_conta_pagar_chegada_comercial) na insercao.
// - Por que: a primeira etapa do compras comercial e registrar a entrada do metal na loja.
// - Impacto se alterado/removido: o metal recem-chegado para de ser rastreado antes do cadastro.
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const raw = await req.json().catch(() => ({}));
  const parsed = ChegadaPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const {
    fornecedor_id,
    obs,
    local_estoque_id,
    numero_nf,
    data_compra,
    qtd_parcelas,
    primeiro_vencimento,
    total_pecas,
    peso_total_g,
    valor_total,
    foto_balanca_base64,
    foto_balanca_media_type,
    foto_pecas_base64,
    foto_pecas_media_type,
  } = parsed.data;

  // REGRA DE NEGOCIO: valor da grama = valor total do lote / peso total (ex: 30000 / 10 = 3000).
  // E o custo base que sera rateado por peso em cada peca no cadastro.
  const valorGrama = Math.round((valor_total / peso_total_g) * 100) / 100;

  // Tolerancia (g) de "diferenca de balanca" — usada pela IA na conferencia da foto da balanca.
  let toleranciaG = TOLERANCIA_PADRAO_G;
  try {
    const [cfg] = await sql`SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'tolerancia_lote_peso_g' LIMIT 1`;
    const v = Number(String(cfg?.valor ?? "").replace(",", "."));
    if (Number.isFinite(v) && v > 0) toleranciaG = v;
  } catch { /* usa padrao */ }

  try {
    // 1) Insere a chegada. O trigger AFTER INSERT gera a conta a pagar a partir do valor do lote.
    const [row] = await sql`
      INSERT INTO alissonerp.compras_comercial
        (fornecedor_id, obs, situacao, local_estoque_id, numero_nf, data_compra,
         qtd_parcelas, primeiro_vencimento, created_by,
         total_pecas, peso_total_g, valor_total_lote, valor_grama)
      VALUES (
        ${fornecedor_id ?? null},
        ${obs ?? null},
        'recebido_pendente_cadastro',
        ${local_estoque_id},
        ${numero_nf ?? null},
        ${data_compra ?? null},
        ${qtd_parcelas},
        ${primeiro_vencimento},
        ${user.id}::uuid,
        ${total_pecas},
        ${peso_total_g},
        ${valor_total},
        ${valorGrama}
      )
      RETURNING *
    `;
    const compraId = Number(row.id);

    // 2) Sobe as 2 fotos (bucket privado). Falha de upload aborta a chegada (foto e obrigatoria).
    await ensureBucket(BUCKET_CHEGADA);
    const tipoBal = foto_balanca_media_type || "image/jpeg";
    const tipoPec = foto_pecas_media_type || "image/jpeg";
    const upBal = await uploadFile(BUCKET_CHEGADA, `${compraId}/balanca.jpg`, foto_balanca_base64, tipoBal);
    const upPec = await uploadFile(BUCKET_CHEGADA, `${compraId}/pecas.jpg`, foto_pecas_base64, tipoPec);
    if ("error" in upBal || "error" in upPec) {
      // Reverte a chegada para nao deixar compra sem foto + conta a pagar orfã.
      await sql`DELETE FROM alissonerp.contas_pagar WHERE compra_comercial_id = ${compraId}`;
      await sql`DELETE FROM alissonerp.compras_comercial WHERE id = ${compraId}`;
      return NextResponse.json({ error: "Falha ao salvar as fotos da chegada" }, { status: 502 });
    }

    // 3) IA confere o peso na foto da balanca (advisory: registra e avisa, nao bloqueia a chegada).
    let iaPeso: number | null = null;
    let iaMatch: boolean | null = null;
    let iaConfianca: string | null = null;
    let iaMensagem: string | null = null;
    try {
      const ia = await validarPesoBalanca(foto_balanca_base64, tipoBal, peso_total_g, "metal");
      iaPeso = ia.peso_balanca;
      iaConfianca = ia.confianca;
      if (ia.peso_balanca !== null) {
        const diff = Math.abs(ia.peso_balanca - peso_total_g);
        iaMatch = diff <= toleranciaG;
        iaMensagem = iaMatch
          ? `Peso confirmado pela IA: ${ia.peso_balanca}g`
          : `Atenção: balança ${ia.peso_balanca}g x informado ${peso_total_g}g (diferença ${diff.toFixed(3)}g > ${toleranciaG}g)`;
      } else {
        iaMatch = null;
        iaMensagem = ia.mensagem;
      }
    } catch {
      iaMensagem = "Não foi possível validar a foto da balança com a IA.";
    }

    // 4) Grava paths das fotos + leitura da IA.
    const [updated] = await sql`
      UPDATE alissonerp.compras_comercial
      SET foto_balanca_path = ${upBal.path},
          foto_pecas_path = ${upPec.path},
          ia_peso_balanca = ${iaPeso},
          ia_match = ${iaMatch},
          ia_confianca = ${iaConfianca},
          ia_mensagem = ${iaMensagem}
      WHERE id = ${compraId}
      RETURNING *
    `;

    return NextResponse.json(normalizeRow(updated as Record<string, unknown>, NUM_FIELDS, []), { status: 201 });
  } catch (err) {
    return internalError("[POST /api/compras-comercial] chegada", err);
  }
}
