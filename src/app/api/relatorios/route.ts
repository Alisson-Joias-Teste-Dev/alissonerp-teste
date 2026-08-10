import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// ─── GET /api/relatorios?tipo=producao|comercial|financeiro|estoque&inicio=&fim=
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_RELATORIOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || !ROLES_RELATORIOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") || "producao";
  const inicio = url.searchParams.get("inicio") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const fim = url.searchParams.get("fim") || new Date().toISOString().slice(0, 10);

  switch (tipo) {
    case "producao": {
      const [ordens, ourives, quebra_mensal] = await Promise.all([
        sql`
          SELECT
            COUNT(*) FILTER (WHERE status = 'em_andamento') AS em_andamento,
            COUNT(*) FILTER (WHERE status = 'concluido') AS concluidas,
            COUNT(*) FILTER (WHERE status = 'aguardando') AS aguardando,
            COUNT(*) AS total
          FROM alissonerp.ordens
          WHERE created_at >= ${inicio}::date AND created_at <= ${fim}::date + interval '1 day'
        `,
        sql`
          SELECT
            u.nome, COUNT(p.id) AS pcps_concluidos,
            COALESCE(AVG(p.porcentagem_de_quebra), 0) AS media_quebra
          FROM alissonerp.pcp p
          JOIN alissonerp.usuarios u ON u.id = p.operador
          WHERE p.etapas = 'concluido'
            AND p.data_conclusao >= ${inicio}::date AND p.data_conclusao <= ${fim}::date + interval '1 day'
          GROUP BY u.nome ORDER BY pcps_concluidos DESC LIMIT 10
        `,
        sql`
          SELECT
            TO_CHAR(data_conclusao, 'YYYY-MM') AS mes,
            COUNT(*) AS total,
            COALESCE(AVG(porcentagem_de_quebra), 0) AS media_quebra
          FROM alissonerp.pcp
          WHERE data_conclusao >= ${inicio}::date AND data_conclusao <= ${fim}::date + interval '1 day'
            AND etapas = 'concluido'
          GROUP BY mes ORDER BY mes
        `,
      ]);
      return NextResponse.json({
        tipo: "producao",
        periodo: { inicio, fim },
        resumo: ordens[0],
        ourives: ourives.map((o) => ({ ...o, pcps_concluidos: Number(o.pcps_concluidos), media_quebra: Number(Number(o.media_quebra).toFixed(2)) })),
        quebra_mensal: quebra_mensal.map((q) => ({ ...q, total: Number(q.total), media_quebra: Number(Number(q.media_quebra).toFixed(2)) })),
      });
    }

    case "comercial": {
      const [vendas, ranking, por_tipo] = await Promise.all([
        sql`
          SELECT
            COUNT(*) AS total_vendas,
            COALESCE(SUM(total_venda), 0) AS valor_total,
            COALESCE(SUM(total_comissao), 0) AS total_comissao,
            COALESCE(SUM(total_desconto), 0) AS total_desconto
          FROM alissonerp.vendas_erp
          WHERE data_venda >= ${inicio}::date AND data_venda <= ${fim}::date
            AND status != 'cancelado'
        `,
        sql`
          SELECT
            v.nome AS vendedor, COUNT(ve.id) AS qtd_vendas,
            COALESCE(SUM(ve.total_venda), 0) AS valor_total,
            COALESCE(SUM(ve.total_comissao), 0) AS comissao
          FROM alissonerp.vendas_erp ve
          JOIN public.vendedores v ON v.id_vendedor = ve.vendedor_id
          WHERE ve.data_venda >= ${inicio}::date AND ve.data_venda <= ${fim}::date
            AND ve.status != 'cancelado'
          GROUP BY v.nome ORDER BY valor_total DESC LIMIT 10
        `,
        sql`
          SELECT
            TO_CHAR(data_venda, 'YYYY-MM') AS mes,
            COUNT(*) AS qtd, COALESCE(SUM(total_venda), 0) AS valor
          FROM alissonerp.vendas_erp
          WHERE data_venda >= ${inicio}::date AND data_venda <= ${fim}::date
            AND status != 'cancelado'
          GROUP BY mes ORDER BY mes
        `,
      ]);
      return NextResponse.json({
        tipo: "comercial",
        periodo: { inicio, fim },
        resumo: { ...vendas[0], total_vendas: Number(vendas[0].total_vendas), valor_total: Number(vendas[0].valor_total), total_comissao: Number(vendas[0].total_comissao), total_desconto: Number(vendas[0].total_desconto) },
        ranking: ranking.map((r) => ({ ...r, qtd_vendas: Number(r.qtd_vendas), valor_total: Number(r.valor_total), comissao: Number(r.comissao) })),
        por_mes: por_tipo.map((p) => ({ ...p, qtd: Number(p.qtd), valor: Number(p.valor) })),
      });
    }

    case "financeiro": {
      const [pagar, receber] = await Promise.all([
        sql`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
            COALESCE(SUM(valor) FILTER (WHERE status = 'pendente'), 0) AS total_pendente,
            COUNT(*) FILTER (WHERE status = 'pago') AS pagos,
            COALESCE(SUM(valor) FILTER (WHERE status = 'pago'), 0) AS total_pago,
            COUNT(*) FILTER (WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE) AS vencidos
          FROM alissonerp.contas_pagar
          WHERE created_at >= ${inicio}::date AND created_at <= ${fim}::date + interval '1 day'
        `,
        sql`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
            COALESCE(SUM(valor) FILTER (WHERE status = 'pendente'), 0) AS total_pendente,
            COUNT(*) FILTER (WHERE status = 'recebido') AS recebidos,
            COALESCE(SUM(valor) FILTER (WHERE status = 'recebido'), 0) AS total_recebido,
            COUNT(*) FILTER (WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE) AS vencidos
          FROM alissonerp.contas_receber
          WHERE created_at >= ${inicio}::date AND created_at <= ${fim}::date + interval '1 day'
        `,
      ]);
      return NextResponse.json({
        tipo: "financeiro",
        periodo: { inicio, fim },
        pagar: { ...pagar[0], pendentes: Number(pagar[0].pendentes), total_pendente: Number(pagar[0].total_pendente), pagos: Number(pagar[0].pagos), total_pago: Number(pagar[0].total_pago), vencidos: Number(pagar[0].vencidos) },
        receber: { ...receber[0], pendentes: Number(receber[0].pendentes), total_pendente: Number(receber[0].total_pendente), recebidos: Number(receber[0].recebidos), total_recebido: Number(receber[0].total_recebido), vencidos: Number(receber[0].vencidos) },
      });
    }

    case "estoque": {
      const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
      const ouro18kId      = await getParametroNumber(PARAM.OURO_18K_INSUMO_ID);
      const [saldo_ouro, alertas, movimentacoes] = await Promise.all([
        sql`
          SELECT COALESCE(SUM(saldo), 0) AS total_ouro
          FROM alissonerp.vw_saldo_estoque
          WHERE deposito_id = ${almoxarifadoId} AND insumo_id = ${ouro18kId}
        `,
        sql`
          SELECT status_alerta, COUNT(*) AS qtd
          FROM alissonerp.vw_estoque_comercial_com_alerta
          GROUP BY status_alerta
        `,
        sql`
          SELECT
            TO_CHAR(created_at, 'YYYY-MM') AS mes,
            COUNT(*) AS total_movimentacoes,
            COALESCE(SUM(quantidade) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
            COALESCE(SUM(quantidade) FILTER (WHERE tipo = 'saida'), 0) AS saidas
          FROM alissonerp.movimentacoes_estoque_comercial
          WHERE created_at >= ${inicio}::date AND created_at <= ${fim}::date + interval '1 day'
          GROUP BY mes ORDER BY mes
        `,
      ]);
      return NextResponse.json({
        tipo: "estoque",
        periodo: { inicio, fim },
        ouro_pote: Number(saldo_ouro[0].total_ouro),
        alertas_comercial: alertas.map((a) => ({ ...a, qtd: Number(a.qtd) })),
        movimentacoes_mensal: movimentacoes.map((m) => ({ ...m, total_movimentacoes: Number(m.total_movimentacoes), entradas: Number(m.entradas), saidas: Number(m.saidas) })),
      });
    }

    default:
      return NextResponse.json({ error: "Tipo inválido. Use: producao, comercial, financeiro, estoque" }, { status: 400 });
  }
}
