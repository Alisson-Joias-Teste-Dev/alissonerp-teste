import { createServerSupabase } from "@/lib/supabase/server";
import sql, { normalizeRow } from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import PurificacaoClient from "./PurificacaoClient";

export const dynamic = "force-dynamic";

export default async function PurificacaoPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRole: string | null = null;
  let userId: string | null = null;
  const permissoesPurif = {
    abrir_purificacao: false,
    concluir_purificacao: false,
    abrir_ligacao: false,
    concluir_ligacao: false,
    editar_teor_ligacao: false,
  };

  if (user) {
    userId = user.id;
    const [usuario] = await sql`
      SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    userRole = (usuario?.role as string | null) ?? null;

    // Buscar permissões granulares do usuário logado
    const permRows = await sql`
      SELECT acao, permitido FROM alissonerp.permissoes_usuario
      WHERE usuario_id = ${user.id}::uuid
    `;
    for (const row of permRows) {
      if (row.acao in permissoesPurif) {
        (permissoesPurif as Record<string, boolean>)[row.acao as string] = row.permitido as boolean;
      }
    }
  }

  // Parâmetros de estoque (§5): id do Ouro 24k fino e depósito do pote (Almoxarifado Central).
  const ouro24kLigaId  = await getParametroNumber(PARAM.OURO_24K_LIGA_INSUMO_ID);
  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // Carregar dados iniciais em paralelo
  const [purificacoes, teores, statsRow, ligacoes, ligaTipos, ligacaoStatsRow] = await Promise.all([
    // ── Purificações ──────────────────────────────────────────────────────────
    sql`
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
      LIMIT 100
    `,
    // ── Teores ────────────────────────────────────────────────────────────────
    sql`
      SELECT
        t.id,
        t.insumo_id,
        t.nome,
        t.teor,
        t.ativo,
        i.sku,
        i.unidade,
        vp.saldo_real AS saldo
      FROM alissonerp.teores_ouro t
      JOIN alissonerp.insumos i ON i.id = t.insumo_id
      LEFT JOIN alissonerp.vw_detalhe_pote vp ON vp.insumo_id = t.insumo_id
      WHERE t.ativo = true
      ORDER BY t.nome
    `,
    // ── Stats purificação ──────────────────────────────────────────────────────
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'em_processo' THEN peso_total_enviado END), 0)::numeric AS em_processo_g,
        COUNT(CASE WHEN status = 'concluida' AND data_retorno >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS concluidas_30d,
        COALESCE(AVG(CASE WHEN status = 'concluida' AND data_retorno >= NOW() - INTERVAL '30 days' THEN perda_percentual END), 0)::numeric AS perda_media_pct
      FROM alissonerp.purificacoes
    `,
    // ── Ligações ──────────────────────────────────────────────────────────────
    sql`
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
      LIMIT 100
    `,
    // ── Liga tipos ────────────────────────────────────────────────────────────
    sql`
      SELECT
        lto.id,
        lto.tipo_18k_insumo_id,
        i18k.nome       AS tipo_18k_nome,
        lto.liga_insumo_id,
        iliga.nome      AS liga_nome,
        lto.teor_default,
        lto.ativo,
        COALESCE((
          SELECT SUM(saldo) FROM alissonerp.vw_saldo_estoque
          WHERE insumo_id = ${ouro24kLigaId} AND deposito_id = ${almoxarifadoId}
        ), 0)::numeric AS saldo_24k,
        COALESCE((
          SELECT SUM(saldo) FROM alissonerp.vw_saldo_estoque
          WHERE insumo_id = lto.liga_insumo_id AND deposito_id = ${almoxarifadoId}
        ), 0)::numeric AS saldo_liga
      FROM alissonerp.liga_tipo_ouro lto
      JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
      JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
      WHERE lto.ativo = true
      ORDER BY lto.id
    `,
    // ── Stats ligação ──────────────────────────────────────────────────────────
    sql`
      SELECT
        COUNT(CASE WHEN status = 'em_processo' THEN 1 END)::int AS em_processo_count,
        COALESCE(SUM(CASE WHEN status = 'em_processo' THEN peso_24k END), 0)::numeric AS em_processo_g,
        COUNT(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS concluidas_30d,
        COALESCE(AVG(CASE WHEN status = 'concluida' AND data_conclusao >= NOW() - INTERVAL '30 days' THEN perda_percentual END), 0)::numeric AS perda_media_pct
      FROM alissonerp.ligacoes
    `,
  ]);

  const PURIF_NUMERIC = ["peso_total_enviado", "teor_medio", "peso_esperado_24k", "peso_retornado_24k", "perda_processo", "perda_percentual"];
  const normalizedPurificacoes = purificacoes.map(row => {
    const n = normalizeRow(row as Record<string, unknown>, PURIF_NUMERIC, ["itens"]);
    if (Array.isArray(n.itens)) {
      n.itens = (n.itens as Record<string, unknown>[]).map(item => normalizeRow(item, ["peso", "teor"]));
    }
    return n;
  });

  const normalizedTeores = teores.map(row =>
    normalizeRow(row as Record<string, unknown>, ["teor", "saldo"]),
  );

  const LIGA_NUMERIC = ["peso_24k", "pureza", "teor", "peso_liga_calculado", "peso_18k_esperado", "peso_18k_real", "perda_processo", "perda_percentual"];
  const normalizedLigacoes = ligacoes.map(row =>
    normalizeRow(row as Record<string, unknown>, LIGA_NUMERIC),
  );

  const normalizedLigaTipos = ligaTipos.map(row =>
    normalizeRow(row as Record<string, unknown>, ["teor_default", "saldo_24k", "saldo_liga"]),
  );

  const stats = normalizeRow(statsRow[0] as Record<string, unknown>, ["em_processo_g", "perda_media_pct"]) as {
    em_processo_g: number;
    concluidas_30d: number;
    perda_media_pct: number;
  };

  const ligacaoStats = normalizeRow(ligacaoStatsRow[0] as Record<string, unknown>, ["em_processo_g", "perda_media_pct"]) as {
    em_processo_count: number;
    em_processo_g: number;
    concluidas_30d: number;
    perda_media_pct: number;
  };

  return (
    <PurificacaoClient
      purificacoes={normalizedPurificacoes as any[]}
      teores={normalizedTeores as any[]}
      stats={{
        em_processo_g:   stats.em_processo_g,
        concluidas_30d:  stats.concluidas_30d,
        perda_media_pct: stats.perda_media_pct,
      }}
      ligacoes={normalizedLigacoes as any[]}
      ligaTipos={normalizedLigaTipos as any[]}
      ligacaoStats={{
        em_processo_count: ligacaoStats.em_processo_count,
        em_processo_g:     ligacaoStats.em_processo_g,
        concluidas_30d:    ligacaoStats.concluidas_30d,
        perda_media_pct:   ligacaoStats.perda_media_pct,
      }}
      userRole={userRole}
      userId={userId}
      permissoesPurif={permissoesPurif}
    />
  );
}
