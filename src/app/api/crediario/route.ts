import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_CREDIARIO = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// GET /api/crediario
// Params: situacao, status_aging, vendedor_id (admin/gerente only), page, limit
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_CREDIARIO.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const situacao    = url.searchParams.get("situacao") ?? "";     // pendente | pago | cancelado
  const statusAging = url.searchParams.get("status_aging") ?? ""; // vencido | vence_em_breve | em_dia
  const page        = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit       = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset      = (page - 1) * limit;

  // Filtro de vendedor: consultora vê só as suas, gerente/admin veem tudo (ou filtrado)
  const isConsultora = usuario.role === "consultora";
  const vendedorIdParam = url.searchParams.get("vendedor_id");
  const vendedorId = isConsultora
    ? (usuario.vendedor_id as number | null)
    : vendedorIdParam ? Number(vendedorIdParam) : null;

  // Consultora sem vendedor_id configurado não vê nada
  if (isConsultora && !vendedorId) {
    return NextResponse.json({ items: [], total: 0, page, limit, totalPages: 0 });
  }

  const whereVendedor = vendedorId !== null
    ? sql`AND vendedor_id = ${vendedorId}`
    : sql``;

  // CREDIÁRIO = só vendas que foram "A Receber" (fiado). EXCLUI as pagas pelo
  // PEDIDO via gateway (cartão/Pix do Mercado Pago, source='webhook_mp') que
  // nunca tiveram "A Receber" — ex.: venda 15643. MANTÉM o legado (fiado antigo
  // sem pagamento registrado) e o fiado moderno (tem "A Receber"). Filtro de
  // EXIBIÇÃO — não altera nada no banco.
  const whereCrediario = sql`
    AND (
      EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
              WHERE p.venda_id = vw_crediario.venda_id AND p.forma = 'A Receber')
      OR NOT EXISTS (SELECT 1 FROM alissonerp.pagamentos_venda p
                     WHERE p.venda_id = vw_crediario.venda_id AND p.source = 'webhook_mp')
    )
  `;

  const whereSituacao = situacao
    ? sql`AND situacao = ${situacao}`
    : sql``;

  const whereAging = statusAging
    ? sql`AND status_aging = ${statusAging}`
    : sql``;

  // Drill-down dos cards de período (clicar em "Vendeu"/"Recebeu"):
  //  - drill=vendido  → contas de vendas FEITAS no período (data_venda), não canceladas.
  //  - drill=recebido → contas PAGAS no período (data_recebimento).
  // Quando presente, SUBSTITUI o filtro de situacao/aging na lista.
  const drill     = url.searchParams.get("drill"); // 'vendido' | 'recebido'
  const drillFrom = url.searchParams.get("from");
  const drillTo   = url.searchParams.get("to");
  const whereDrill =
    (drill === "recebido" && drillFrom && drillTo)
      ? sql`AND situacao = 'pago' AND data_recebimento BETWEEN ${drillFrom}::date AND ${drillTo}::date`
      : (drill === "vendido" && drillFrom && drillTo)
        ? sql`AND situacao <> 'cancelado'
              AND COALESCE((SELECT v.data_venda FROM alissonerp.vendas_erp v WHERE v.id = venda_id), venda_created_at::date)
                  BETWEEN ${drillFrom}::date AND ${drillTo}::date`
        : null;
  const whereLista = whereDrill ?? sql`${whereSituacao} ${whereAging}`;

  // Resumo (cards): pendente/vencido/recebidos com o MESMO filtro de vendedor,
  // ignorando situacao/aging — usado quando a tela troca de consultora. Só
  // computa se pedido (counts=1) para não pesar as listagens normais.
  const wantCounts = url.searchParams.get("counts") === "1";
  const contagensQuery = wantCounts
    ? sql`
        SELECT
          COUNT(*)::integer                                                                       AS total,
          COUNT(*) FILTER (WHERE situacao='pendente')::integer                                    AS pendente,
          COUNT(*) FILTER (WHERE situacao='pago')::integer                                        AS pago,
          COUNT(*) FILTER (WHERE status_aging='vencido' AND situacao='pendente')::integer         AS vencido,
          COALESCE(SUM(valor) FILTER (WHERE situacao='pendente'), 0)                              AS valor_pendente,
          COALESCE(SUM(valor) FILTER (WHERE status_aging='vencido' AND situacao='pendente'), 0)   AS valor_vencido
        FROM alissonerp.vw_crediario
        WHERE 1=1 ${whereVendedor} ${whereCrediario}
      `
    : Promise.resolve(null);

  // Período (cards "Vendeu em crediário" / "Recebeu"): só quando vêm from+to.
  //  - vendido  = crediário GERADO em vendas feitas no período (venda_created_at),
  //               somando todas as contas não-canceladas da venda (original + splits
  //               "Saldo restante" = total original); exclui canceladas.
  //  - recebido = valor BAIXADO no período (data_recebimento de contas pagas).
  // Ambos respeitam o filtro de vendedor (consultora) já aplicado.
  const periodoFrom = url.searchParams.get("from");
  const periodoTo   = url.searchParams.get("to");
  const periodoQuery = (periodoFrom && periodoTo)
    ? sql`
        SELECT
          COALESCE(SUM(valor) FILTER (
            WHERE situacao <> 'cancelado'
              AND COALESCE((SELECT v.data_venda FROM alissonerp.vendas_erp v WHERE v.id = venda_id), venda_created_at::date)
                  BETWEEN ${periodoFrom}::date AND ${periodoTo}::date), 0) AS vendido,
          COALESCE(SUM(valor) FILTER (
            WHERE situacao = 'pago'
              AND data_recebimento BETWEEN ${periodoFrom}::date AND ${periodoTo}::date), 0) AS recebido
        FROM alissonerp.vw_crediario
        WHERE 1=1 ${whereVendedor} ${whereCrediario}
      `
    : Promise.resolve(null);

  // Pagos: ordenar por data_recebimento DESC (mais recente primeiro)
  // Pendentes/todos: urgência (vencido→breve→em_dia), depois vencimento ASC
  const isPago = situacao === "pago" || drill === "recebido";

  const [items, countResult, contagensResult, periodoResult] = await Promise.all([
    sql`
      SELECT
        conta_receber_id,
        descricao,
        valor,
        data_vencimento,
        data_recebimento,
        situacao,
        status_aging,
        dias_atraso,
        obs,
        created_at,
        venda_id,
        numero_venda,
        total_venda,
        venda_situacao,
        venda_bloqueada,
        credito_gerente_usado,
        venda_created_at,
        (SELECT v.data_venda FROM alissonerp.vendas_erp v WHERE v.id = venda_id) AS data_venda,
        cliente_id,
        cliente_nome,
        cliente_telefone,
        vendedor_id,
        vendedor_nome,
        consultora_uuid,
        consultora_nome
      FROM alissonerp.vw_crediario
      WHERE 1=1
        ${whereVendedor}
        ${whereCrediario}
        ${whereLista}
      ORDER BY
        CASE WHEN ${isPago} THEN 0 ELSE
          CASE WHEN status_aging = 'vencido' THEN 0
               WHEN status_aging = 'vence_em_breve' THEN 1
               ELSE 2 END
        END,
        CASE WHEN ${isPago} THEN data_recebimento END DESC NULLS LAST,
        CASE WHEN NOT ${isPago} THEN data_vencimento END ASC NULLS LAST,
        conta_receber_id DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::integer AS total
      FROM alissonerp.vw_crediario
      WHERE 1=1
        ${whereVendedor}
        ${whereCrediario}
        ${whereLista}
    `,
    contagensQuery,
    periodoQuery,
  ]);

  const total = countResult[0].total as number;

  const contagens = contagensResult?.[0]
    ? {
        total:          Number(contagensResult[0].total),
        pendente:       Number(contagensResult[0].pendente),
        pago:           Number(contagensResult[0].pago),
        vencido:        Number(contagensResult[0].vencido),
        valor_pendente: Number(contagensResult[0].valor_pendente),
        valor_vencido:  Number(contagensResult[0].valor_vencido),
      }
    : undefined;

  const periodo = periodoResult?.[0]
    ? {
        vendido:  Number(periodoResult[0].vendido),
        recebido: Number(periodoResult[0].recebido),
      }
    : undefined;

  return NextResponse.json({
    items: items.map((r) => ({
      ...r,
      valor:               Number(r.valor),
      total_venda:         r.total_venda ? Number(r.total_venda) : null,
      credito_gerente_usado: r.credito_gerente_usado ? Number(r.credito_gerente_usado) : null,
      dias_atraso:         Number(r.dias_atraso ?? 0),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    ...(contagens ? { contagens } : {}),
    ...(periodo ? { periodo } : {}),
  });
}
