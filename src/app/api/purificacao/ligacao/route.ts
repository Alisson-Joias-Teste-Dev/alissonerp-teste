import { NextRequest, NextResponse } from "next/server";
import sql, { normalizeRow } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isFullAccess } from "@/lib/roles";

// GET /api/purificacao/ligacao?status=em_processo&page=1
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const page   = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit  = 20;
  const offset = (page - 1) * limit;

  const rows = status
    ? await sql`
        SELECT
          l.id,
          l.status,
          l.tipo_18k_insumo_id,
          l.tipo_18k_nome,
          l.liga_insumo_id,
          l.liga_nome,
          l.peso_24k,
          l.teor,
          l.peso_liga_calculado,
          l.peso_18k_esperado,
          l.foto_envio,
          l.observacao_envio,
          l.data_envio,
          l.peso_18k_real,
          l.perda_processo,
          l.perda_percentual,
          l.foto_resultado,
          l.observacao_resultado,
          l.data_conclusao,
          l.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.ligacoes l
        LEFT JOIN public.user_profiles up ON up.id_user = l.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = l.concluido_por
        WHERE l.status = ${status}
        ORDER BY l.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          l.id,
          l.status,
          l.tipo_18k_insumo_id,
          l.tipo_18k_nome,
          l.liga_insumo_id,
          l.liga_nome,
          l.peso_24k,
          l.teor,
          l.peso_liga_calculado,
          l.peso_18k_esperado,
          l.foto_envio,
          l.observacao_envio,
          l.data_envio,
          l.peso_18k_real,
          l.perda_processo,
          l.perda_percentual,
          l.foto_resultado,
          l.observacao_resultado,
          l.data_conclusao,
          l.created_at,
          up.name       AS criado_por_nome,
          up.avatar_url AS criado_por_foto,
          uc.name       AS concluido_por_nome
        FROM alissonerp.ligacoes l
        LEFT JOIN public.user_profiles up ON up.id_user = l.criado_por
        LEFT JOIN public.user_profiles uc ON uc.id_user = l.concluido_por
        ORDER BY l.data_envio DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const [countRow] = status
    ? await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ligacoes WHERE status = ${status}`
    : await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ligacoes`;

  const [statsRow] = await sql`
    SELECT
      COUNT(CASE WHEN status = 'em_processo' THEN 1 END)::int          AS em_processo_count,
      COALESCE(SUM(CASE WHEN status = 'em_processo' THEN peso_24k END), 0)::numeric AS em_processo_g,
      COUNT(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS concluidas_30d,
      COALESCE(AVG(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN perda_percentual END), 0)::numeric AS perda_media_pct
    FROM alissonerp.ligacoes
  `;

  const NUMERIC_FIELDS = ["peso_24k", "pureza", "teor", "peso_liga_calculado", "peso_18k_esperado", "peso_18k_real", "perda_processo", "perda_percentual"];
  const ligacoes = rows.map(row => normalizeRow(row as Record<string, unknown>, NUMERIC_FIELDS));

  return NextResponse.json({
    ligacoes,
    total: (countRow as { total: number }).total,
    stats: {
      em_processo_count: (statsRow as any).em_processo_count,
      em_processo_g:     Number((statsRow as any).em_processo_g),
      concluidas_30d:    (statsRow as any).concluidas_30d,
      perda_media_pct:   Number((statsRow as any).perda_media_pct),
    },
  });
}

// POST /api/purificacao/ligacao — Criar nova ligação
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    tipo_18k_insumo_id: number;
    peso_24k: number;
    pureza?: number;
    teor: number;
    foto_envio?: string | null;
    observacao?: string | null;
    user_id?: string | null;
    user_role?: string | null;
  };

  const { tipo_18k_insumo_id, peso_24k, pureza = 100, teor, foto_envio, observacao, user_id, user_role } = body;

  if (!user_id || !user_role) {
    return NextResponse.json({ error: "user_id e user_role obrigatórios" }, { status: 400 });
  }

  // Verificar permissão granular (admin/dev passam sempre)
  if (!isFullAccess(user_role)) {
    const [perm] = await sql`
      SELECT permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user_id}::uuid AND acao = 'abrir_ligacao'
    `;
    if (!perm?.permitido) {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação. Solicite ao administrador." },
        { status: 403 },
      );
    }
  }

  if (!tipo_18k_insumo_id || !Number.isInteger(tipo_18k_insumo_id)) {
    return NextResponse.json({ error: "tipo_18k_insumo_id obrigatório" }, { status: 400 });
  }

  if (!peso_24k || peso_24k <= 0) {
    return NextResponse.json({ error: "peso_24k deve ser maior que zero" }, { status: 400 });
  }

  if (!teor || teor <= 0.01 || teor > 1.0) {
    return NextResponse.json({ error: "teor inválido. Deve ser entre 0.01 e 1.00" }, { status: 400 });
  }

  // Buscar mapeamento liga↔tipo
  const [mapeamento] = await sql`
    SELECT
      lto.id,
      lto.liga_insumo_id,
      i18k.nome  AS tipo_18k_nome,
      iliga.nome AS liga_nome
    FROM alissonerp.liga_tipo_ouro lto
    JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
    JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
    WHERE lto.tipo_18k_insumo_id = ${tipo_18k_insumo_id}
      AND lto.ativo = true
    LIMIT 1
  `;

  if (!mapeamento) {
    return NextResponse.json(
      { error: "Liga não configurada para este tipo de 18k" },
      { status: 400 },
    );
  }

  const liga_insumo_id  = (mapeamento as any).liga_insumo_id as number;
  const tipo_18k_nome   = (mapeamento as any).tipo_18k_nome  as string;
  const liga_nome       = (mapeamento as any).liga_nome      as string;

  // Calcular pesos (com pureza)
  const pureza_decimal      = Math.min(Math.max(pureza, 0), 100) / 100;
  const ouro_puro_real      = Number((peso_24k * pureza_decimal).toFixed(3));
  const peso_18k_esperado   = Number((ouro_puro_real / teor).toFixed(3));
  const peso_liga_calculado = Number((peso_18k_esperado - peso_24k).toFixed(3));

  // Verificar saldo Ouro 24k no pote
  const [saldo24kRow] = await sql`
    SELECT COALESCE(saldo_real, 0)::numeric AS saldo_real
    FROM alissonerp.vw_detalhe_pote
    WHERE insumo_id = 275
  `;
  const saldo24k = Number((saldo24kRow as any)?.saldo_real ?? 0);
  if (peso_24k > saldo24k) {
    return NextResponse.json(
      { error: `Saldo insuficiente de Ouro 24k. Saldo: ${saldo24k.toFixed(3)}g, Solicitado: ${peso_24k}g` },
      { status: 400 },
    );
  }

  // Verificar saldo da liga no pote
  const [saldoLigaRow] = await sql`
    SELECT COALESCE(saldo_real, 0)::numeric AS saldo_real
    FROM alissonerp.vw_detalhe_pote
    WHERE insumo_id = ${liga_insumo_id}
  `;
  const saldoLiga = Number((saldoLigaRow as any)?.saldo_real ?? 0);
  if (peso_liga_calculado > saldoLiga) {
    return NextResponse.json(
      { error: `Saldo insuficiente de ${liga_nome}. Saldo: ${saldoLiga.toFixed(3)}g, Necessário: ${peso_liga_calculado.toFixed(3)}g` },
      { status: 400 },
    );
  }

  // Upload foto
  let foto_url: string | null = null;
  if (foto_envio) {
    const timestamp = Date.now();
    const uploadResult = await uploadFile(
      "purificacao-fotos",
      `ligacao-envio-${timestamp}.jpg`,
      foto_envio,
      "image/jpeg",
    );
    if ("error" in uploadResult) {
      return NextResponse.json({ error: `Erro ao fazer upload da foto: ${uploadResult.error}` }, { status: 500 });
    }
    foto_url = uploadResult.url;
  }

  // Inserir ligação e movimentações em transação
  const [ligacao] = await sql`
    INSERT INTO alissonerp.ligacoes (
      status,
      tipo_18k_insumo_id, tipo_18k_nome,
      liga_insumo_id, liga_nome,
      peso_24k, pureza, teor,
      peso_liga_calculado, peso_18k_esperado,
      foto_envio, observacao_envio,
      data_envio, criado_por
    ) VALUES (
      'em_processo',
      ${tipo_18k_insumo_id}, ${tipo_18k_nome},
      ${liga_insumo_id}, ${liga_nome},
      ${peso_24k}, ${Number(pureza.toFixed(2))}, ${Number(teor.toFixed(4))},
      ${peso_liga_calculado}, ${peso_18k_esperado},
      ${foto_url},
      ${observacao ?? null},
      NOW(),
      ${user_id}::uuid
    )
    RETURNING id
  `;

  const ligacao_id = (ligacao as { id: number }).id;

  // CE saída 24k do pote
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, saida, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES (
      275, 1,
      ${peso_24k}::real,
      'LIGA_SAIDA_24K'::alissonerp.enum_marcador_estoque,
      ${'Ligação #' + ligacao_id + ' — saída Ouro 24k'},
      ${user_id}::uuid,
      NOW(), 1
    )
  `;

  // CE saída liga do pote
  await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, saida, marcador, obs, created_by, created_at, local_estoque_id)
    VALUES (
      ${liga_insumo_id}, 1,
      ${peso_liga_calculado}::real,
      'LIGA_SAIDA_LIGA'::alissonerp.enum_marcador_estoque,
      ${'Ligação #' + ligacao_id + ' — saída ' + liga_nome},
      ${user_id}::uuid,
      NOW(), 1
    )
  `;

  return NextResponse.json({ id: ligacao_id, ok: true });
}
