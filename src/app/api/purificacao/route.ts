import { NextRequest, NextResponse } from "next/server";
import sql, { normalizeRow } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { requireAuth, AuthError } from "@/lib/auth-server";

function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  throw e;
}

// GET /api/purificacao?status=em_processo&page=1
export async function GET(req: NextRequest) {
  try { await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const status = req.nextUrl.searchParams.get("status");
  const page   = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const rows = status
    ? await sql`
        SELECT
          p.id,
          p.status,
          p.itens,
          p.peso_total_enviado,
          p.teor_medio,
          p.peso_esperado_24k,
          p.foto_envio,
          p.observacao_envio,
          p.data_envio,
          p.peso_retornado_24k,
          p.perda_processo,
          p.perda_percentual,
          p.foto_retorno,
          p.observacao_retorno,
          p.data_retorno,
          p.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.purificacoes p
        LEFT JOIN public.user_profiles up ON up.id_user = p.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = p.concluido_por
        WHERE p.status = ${status}
        ORDER BY p.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          p.id,
          p.status,
          p.itens,
          p.peso_total_enviado,
          p.teor_medio,
          p.peso_esperado_24k,
          p.foto_envio,
          p.observacao_envio,
          p.data_envio,
          p.peso_retornado_24k,
          p.perda_processo,
          p.perda_percentual,
          p.foto_retorno,
          p.observacao_retorno,
          p.data_retorno,
          p.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.purificacoes p
        LEFT JOIN public.user_profiles up ON up.id_user = p.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = p.concluido_por
        ORDER BY p.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const [countRow] = status
    ? await sql`SELECT COUNT(*)::int AS total FROM alissonerp.purificacoes WHERE status = ${status}`
    : await sql`SELECT COUNT(*)::int AS total FROM alissonerp.purificacoes`;

  const [emProcesso] = await sql`
    SELECT COALESCE(SUM(peso_total_enviado), 0)::numeric AS total_g
    FROM alissonerp.purificacoes
    WHERE status = 'em_processo'
  `;

  const NUMERIC_FIELDS = ["peso_total_enviado", "teor_medio", "peso_esperado_24k", "peso_retornado_24k", "perda_processo", "perda_percentual"];
  const purificacoes = rows.map(row => {
    const normalized = normalizeRow(row as Record<string, unknown>, NUMERIC_FIELDS, ["itens"]);
    if (Array.isArray(normalized.itens)) {
      normalized.itens = (normalized.itens as Record<string, unknown>[]).map(item =>
        normalizeRow(item, ["peso", "teor"]),
      );
    }
    return normalized;
  });

  return NextResponse.json({
    purificacoes,
    total: (countRow as { total: number }).total,
    em_processo_total_g: Number((emProcesso as { total_g: string }).total_g),
  });
}

// POST /api/purificacao — criar nova purificação
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireAuth(req); } catch (e) { return authErrorResponse(e); }

  const body = await req.json() as {
    itens: { insumo_id: number; peso: number; teor: number }[];
    foto_envio?: string | null;
    observacao_envio?: string | null;
  };

  const { itens, foto_envio, observacao_envio } = body;

  // Verificar permissão granular (admin/dev/diretor passam sempre)
  if (!isFullAccess(user.role)) {
    const [perm] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user.id}::uuid AND acao = 'abrir_purificacao'
    `;
    if (!perm?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação. Solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Itens obrigatórios" }, { status: 400 });
  }

  const almoxarifadoId      = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
  const metalCategoriaId    = await getParametroNumber(PARAM.METAL_CATEGORIA_ID);
  const localEstoqueDefault = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);

  // Validar cada item
  for (const item of itens) {
    if (!item.insumo_id || !item.peso || item.peso <= 0) {
      return NextResponse.json(
        { error: "Cada item precisa de insumo_id e peso > 0" },
        { status: 400 },
      );
    }
    if (item.teor <= 0 || item.teor > 1) {
      return NextResponse.json(
        { error: `Teor inválido para insumo_id=${item.insumo_id}. Deve ser entre 0 e 1.` },
        { status: 400 },
      );
    }

    // Verificar se insumo existe e é categoria metal
    const [ins] = await sql`
      SELECT id, categoria_id FROM alissonerp.insumos
      WHERE id = ${item.insumo_id} AND ativo = true LIMIT 1
    `;
    if (!ins) {
      return NextResponse.json(
        { error: `Insumo id=${item.insumo_id} não encontrado ou inativo` },
        { status: 400 },
      );
    }
    if ((ins as { categoria_id: number }).categoria_id !== metalCategoriaId) {
      return NextResponse.json(
        { error: `Insumo id=${item.insumo_id} não é da categoria Metal/Ouro` },
        { status: 400 },
      );
    }

    // Verificar saldo disponível no pote (deposito_id=1)
    const [saldoRow] = await sql`
      SELECT saldo_real FROM alissonerp.vw_detalhe_pote
      WHERE insumo_id = ${item.insumo_id}
    `;
    const saldo = Number((saldoRow as { saldo_real?: number } | undefined)?.saldo_real ?? 0);
    if (item.peso > saldo) {
      return NextResponse.json(
        { error: `Saldo insuficiente para insumo_id=${item.insumo_id}. Saldo: ${saldo}g, Solicitado: ${item.peso}g` },
        { status: 400 },
      );
    }
  }

  // Calcular totais
  const peso_total_enviado = itens.reduce((acc, i) => acc + i.peso, 0);
  // Teor médio ponderado = Σ(peso_i × teor_i) / peso_total
  const teor_medio = itens.reduce((acc, i) => acc + i.peso * i.teor, 0) / peso_total_enviado;
  const peso_esperado_24k = Number((peso_total_enviado * teor_medio).toFixed(2));

  // Upload foto se fornecida
  let foto_url: string | null = null;
  if (foto_envio) {
    const timestamp = Date.now();
    const uploadResult = await uploadFile(
      "purificacao-fotos",
      `purif-envio-${timestamp}.jpg`,
      foto_envio,
      "image/jpeg",
    );
    if ("error" in uploadResult) {
      return NextResponse.json({ error: `Erro ao fazer upload da foto: ${uploadResult.error}` }, { status: 500 });
    }
    foto_url = uploadResult.url;
  }

  // Inserir purificação e movimentações em sequência
  const [purif] = await sql`
    INSERT INTO alissonerp.purificacoes (
      status, itens, peso_total_enviado, teor_medio, peso_esperado_24k,
      foto_envio, observacao_envio, data_envio, criado_por
    ) VALUES (
      'em_processo',
      ${JSON.stringify(itens)}::jsonb,
      ${peso_total_enviado},
      ${Number(teor_medio.toFixed(4))},
      ${peso_esperado_24k},
      ${foto_url},
      ${observacao_envio ?? null},
      NOW(),
      ${user.id}::uuid
    )
    RETURNING id
  `;

  const purif_id = (purif as { id: number }).id;

  // Inserir movimentações de saída para cada item (PURIF_SAIDA do pote deposito_id=1)
  for (const item of itens) {
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque
        (insumo_id, deposito_id, saida, marcador, obs, created_by, created_at, local_estoque_id)
      VALUES
        (
          ${item.insumo_id},
          ${almoxarifadoId},
          ${item.peso}::real,
          'PURIF_SAIDA'::alissonerp.enum_marcador_estoque,
          ${'Purificação #' + purif_id + ' — envio para refino'},
          ${user.id}::uuid,
          NOW(),
          ${localEstoqueDefault}
        )
    `;
  }

  return NextResponse.json({ id: purif_id, ok: true });
}
