import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import OrdensClient from "@/components/OrdensClient";

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
  }

  // Fragmentos SQL dinâmicos — evita "could not determine data type of parameter $N"
  const whereVendedor = vendedorIdFiltro !== null
    ? sql`AND vendedor_id = ${vendedorIdFiltro}`
    : sql``;

  const whereBusca = busca
    ? sql`AND (
        numero_ordem  ILIKE ${'%' + busca + '%'}
        OR numero_pedido::text ILIKE ${'%' + busca + '%'}
        OR cliente_nome  ILIKE ${'%' + busca + '%'}
        OR vendedor_nome ILIKE ${'%' + busca + '%'}
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
        id, numero_ordem, numero_pedido,
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
    />
  );
}
