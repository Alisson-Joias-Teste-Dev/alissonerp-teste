import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import OrdensClient from "@/components/OrdensClient";
import { isMasterAdmin } from "@/lib/master-admin";

export const dynamic = 'force-dynamic';

const FULL_ACCESS_ROLES = ["desenvolvedor", "admin"];
const ALL_TIPOS = [
  "servico_venda", "fabricacao", "reposicao_venda",
  "reposicao_loja", "compra_fornecedor", "garantia", "servico_interno",
];

const PAGE_SIZE = 20;

export default async function OrdensPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    busca?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }>;
}) {
  const sp = await searchParams;

  const page       = Math.max(1, Number(sp?.page) || 1);
  const busca      = (sp?.busca ?? "").trim();
  const status     = sp?.status ?? "";
  const dataInicio = sp?.data_inicio ?? "";
  const dataFim    = sp?.data_fim ?? "";
  const offset     = (page - 1) * PAGE_SIZE;

  // Auth — consultora vê só as ordens do seu vendedor_id
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let vendedorIdFiltro: number | null = null;
  let tiposPermitidos: string[] = [];
  let podeConcluirSistema = false;

  if (user) {
    const [usuario] = await sql`
      SELECT role, vendedor_id, tipos_ordem_permitidos
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario?.role === "consultora" && usuario.vendedor_id != null) {
      vendedorIdFiltro = usuario.vendedor_id as number;
    }
    if (usuario) {
      tiposPermitidos = FULL_ACCESS_ROLES.includes(usuario.role)
        ? ALL_TIPOS
        : (usuario.tipos_ordem_permitidos ?? []);
    }

    /**
     * REGRA DE NEGÓCIO: quem vê o botão "Concluir via Sistema" (conclusão forçada).
     *
     * O QUE: libera o botão para (a) master admin — o dono, sempre; (b) role
     * "desenvolvedor" — fallback técnico para contingência de permissão; e
     * (c) role "admin" — administradores da loja (decisão do dono em 13/07/2026,
     * "todos os admins"). O cálculo é no server e vai ao client só como flag.
     * POR QUE: distribui a contingência de destravar ordens presas para os
     * administradores, sem depender exclusivamente do dono/responsável técnico.
     * IMPACTO SE REMOVIDO: só dono/dev destravam ordens, virando gargalo quando
     * ausentes; se afrouxado, perfis comuns veriam a ação (uso indevido).
     * ATENÇÃO: a MESMA regra é reforçada no back (route concluir-sistema) — o
     * front só esconde o botão; manter as duas em sincronia.
     */
    podeConcluirSistema =
      (await isMasterAdmin(user.id)) ||
      usuario?.role === "desenvolvedor" ||
      usuario?.role === "admin";
  }

  // Fragmentos SQL dinâmicos — evita "could not determine data type of parameter $N"
  // Fallback created_by: ordens criadas pela consultora mas com vendedor_id=NULL
  // também devem aparecer (vendor_id pode ser null quando usuarios.vendedor_id
  // não estava configurado no momento da criação).
  const whereVendedor = vendedorIdFiltro !== null && user
    ? sql`AND (
        vendedor_id = ${vendedorIdFiltro}
        OR id IN (
          SELECT id FROM alissonerp.ordens
          WHERE created_by = ${user.id}::uuid
            AND vendedor_id IS NULL
        )
      )`
    : sql``;

  // unaccent() torna a busca insensível a acentos: usuário digita "Joao"
  // e encontra "João". Requer extensão unaccent (migration 136).
  const whereBusca = busca
    ? sql`AND (
        unaccent(numero_ordem)  ILIKE unaccent(${'%' + busca + '%'})
        OR numero_pedido::text ILIKE ${'%' + busca + '%'}
        OR unaccent(cliente_nome)  ILIKE unaccent(${'%' + busca + '%'})
        OR unaccent(vendedor_nome) ILIKE unaccent(${'%' + busca + '%'})
      )`
    : sql``;

  const whereDataInicio = dataInicio
    ? sql`AND date_created >= ${dataInicio}::date`
    : sql``;

  const whereDataFim = dataFim
    ? sql`AND date_created < ${dataFim}::date + interval '1 day'`
    : sql``;

  const whereStatus =
    status === 'aguardando'   ? sql`AND status = 'Aguardando'` :
    status === 'em_andamento' ? sql`AND status = 'Em Andamento'` :
    status === 'concluido'    ? sql`AND status IN ('Concluído', 'Concluido')` :
    status === 'a_vencer'     ? sql`AND (
        data_entrega IS NOT NULL
        AND data_entrega >= CURRENT_DATE
        AND data_entrega <= CURRENT_DATE + interval '3 days'
        AND status NOT IN ('Concluído', 'Concluido')
      )` :
    status === 'vencidas'     ? sql`AND (
        data_entrega IS NOT NULL
        AND data_entrega < CURRENT_DATE
        AND status NOT IN ('Concluído', 'Concluido')
      )` :
    status === 'vencidas_processo' ? sql`AND (
        data_entrega IS NOT NULL
        AND data_entrega < CURRENT_DATE
        AND status NOT IN ('Concluído', 'Concluido')
      )` :
    status === 'vencidas_producao' ? sql`AND (
        data_entrega IS NOT NULL
        AND data_entrega < CURRENT_DATE
        AND status NOT ILIKE 'conclu%'
        AND id IN (
          SELECT p.ordem_id FROM alissonerp.pcp p
          WHERE p.etapas NOT IN ('concluido', 'cancelado')
        )
      )` :
    sql``;

  const [ordensResult, countResult, contagensResult] = await Promise.all([

    // ── Query principal: ordens da página ──────────────────────────────────────
    sql`
      SELECT
        id, numero_ordem, numero_pedido, venda_id,
        situacao, status, rota, tipo_ordem,
        setor_nome, vendedor_nome, cliente_nome,
        peso_metal_negociado, data_entrega, date_created
      FROM alissonerp.vw_ordens_completa
      WHERE 1=1
        ${whereVendedor}
        ${whereBusca}
        ${whereDataInicio}
        ${whereDataFim}
        ${whereStatus}
      ORDER BY id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,

    // ── Contagem total (mesmos filtros) ────────────────────────────────────────
    sql`
      SELECT COUNT(*) AS total
      FROM alissonerp.vw_ordens_completa
      WHERE 1=1
        ${whereVendedor}
        ${whereBusca}
        ${whereDataInicio}
        ${whereDataFim}
        ${whereStatus}
    `,

    // ── Contagens por status (busca + data, SEM filtro de status) ──────────────
    sql`
      SELECT
        COUNT(*) AS todos,
        COUNT(*) FILTER (WHERE status = 'Aguardando') AS aguardando,
        COUNT(*) FILTER (WHERE status = 'Em Andamento') AS em_andamento,
        COUNT(*) FILTER (WHERE status IN ('Concluído', 'Concluido')) AS concluido,
        COUNT(*) FILTER (
          WHERE data_entrega IS NOT NULL
            AND data_entrega < CURRENT_DATE
            AND status NOT IN ('Concluído', 'Concluido')
        ) AS vencidas,
        COUNT(*) FILTER (
          WHERE data_entrega IS NOT NULL
            AND data_entrega >= CURRENT_DATE
            AND data_entrega <= CURRENT_DATE + interval '3 days'
            AND status NOT IN ('Concluído', 'Concluido')
        ) AS a_vencer,
        COUNT(*) FILTER (
          WHERE v.data_entrega IS NOT NULL
            AND v.data_entrega < CURRENT_DATE
            AND v.status NOT ILIKE 'conclu%'
            AND EXISTS (
              SELECT 1 FROM alissonerp.pcp p
              WHERE p.ordem_id = v.id
                AND p.etapas NOT IN ('concluido', 'cancelado')
            )
        ) AS vencidas_producao
      FROM alissonerp.vw_ordens_completa v
      WHERE 1=1
        ${whereVendedor}
        ${whereBusca}
        ${whereDataInicio}
        ${whereDataFim}
    `,
  ]);

  const totalOrdens = Number(countResult[0].total);
  const totalPages  = Math.ceil(totalOrdens / PAGE_SIZE);
  const contagens   = {
    todos:             Number(contagensResult[0].todos),
    aguardando:        Number(contagensResult[0].aguardando),
    em_andamento:      Number(contagensResult[0].em_andamento),
    concluido:         Number(contagensResult[0].concluido),
    vencidas:          Number(contagensResult[0].vencidas),
    a_vencer:          Number(contagensResult[0].a_vencer),
    vencidas_producao: Number(contagensResult[0].vencidas_producao),
    vencidas_processo: Number(contagensResult[0].vencidas),  // mesmo que vencidas
  };

  return (
    <OrdensClient
      ordens={ordensResult}
      tiposPermitidos={tiposPermitidos}
      currentPage={page}
      totalPages={totalPages}
      totalOrdens={totalOrdens}
      contagens={contagens}
      filtros={{ busca, status, dataInicio, dataFim }}
      podeConcluirSistema={podeConcluirSistema}
    />
  );
}
