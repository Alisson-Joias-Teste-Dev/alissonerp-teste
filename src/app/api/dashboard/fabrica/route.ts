import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { authOr401 } from "@/lib/auth-server";

// GET /api/dashboard/fabrica?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
//
// Retorna:
//   ordens         → contagens por status no período
//   saldo_pote     → saldo de ouro no almoxarifado (tempo real, sem filtro período)
//   ouro_producao  → ouro por operador (tempo real)
//   quebra_operadores → quebra por operador no período
//   financeiro     → entradas/saídas ouro no almoxarifado no período + saldo atual
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const params = req.nextUrl.searchParams;

  // Default: últimos 30 dias
  const hoje  = new Date();
  const menos30 = new Date(hoje);
  menos30.setDate(hoje.getDate() - 30);

  const inicio = params.get("inicio") ?? menos30.toISOString().split("T")[0];
  const fim    = params.get("fim")    ?? hoje.toISOString().split("T")[0];

  // Usar limites de dia inteiro
  const inicioTs = `${inicio} 00:00:00`;
  const fimTs    = `${fim} 23:59:59`;

  // 1. Contagem de ordens PCP — mesma fonte do Kanban (vw_pcp_erp)
  //    vw_pcp_erp expõe etapas como strings mapeadas ("Concluido", "Em Andamento"…)
  //    NÃO como enum bruto ('concluido', 'em_andamento'…)
  const [ordens] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE etapas = 'Concluido')::int                             AS concluidas,
      COUNT(*) FILTER (WHERE etapas IN ('Em Andamento', 'Aguardando'))::int         AS em_producao,
      COUNT(*) FILTER (WHERE etapas IN ('Novas Ordens', 'Pendencia'))::int          AS aguardando,
      COUNT(*) FILTER (WHERE etapas = 'Cancelado')::int                             AS canceladas
    FROM alissonerp.vw_pcp_erp
  `;

  // 2. Saldo do pote (tempo real — sem filtro período)
  const saldoPote = await sql`SELECT * FROM alissonerp.vw_saldo_pote_ouro ORDER BY insumo_nome`;

  // 3. Ouro em produção por operador (tempo real)
  const ouroProducao = await sql`SELECT * FROM alissonerp.vw_ouro_em_producao ORDER BY ouro_g DESC`;

  // 4. Quebra por operador no período
  const quebraOperadores = await sql`
    SELECT
      deposito_id,
      deposito_nome,
      setor_nome,
      COUNT(*)::int               AS registros,
      SUM(ouro_recebido)::float8  AS recebido,
      SUM(ouro_entregue)::float8  AS entregue,
      SUM(quebra)::float8         AS quebra,
      CASE WHEN SUM(ouro_recebido) > 0
        THEN ROUND((SUM(quebra) / SUM(ouro_recebido) * 100)::numeric, 2)
        ELSE 0
      END::float8                 AS percentual
    FROM alissonerp.quebra_operador
    WHERE data_registro BETWEEN ${inicioTs}::timestamptz AND ${fimTs}::timestamptz
    GROUP BY deposito_id, deposito_nome, setor_nome
    ORDER BY quebra DESC
  `;

  const almoxarifadoId  = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);
  const metalCategoriaId = await getParametroNumber(PARAM.METAL_CATEGORIA_ID);

  // 5. Movimentações financeiras do pote no período (entradas e saídas de ouro)
  const [movimentacoes] = await sql`
    SELECT
      COALESCE(SUM(me.entrada), 0)::float8 AS total_entradas,
      COALESCE(SUM(me.saida),   0)::float8 AS total_saidas
    FROM alissonerp.movimentacoes_estoque me
    JOIN alissonerp.insumos i ON i.id = me.insumo_id
    WHERE me.deposito_id = ${almoxarifadoId}
      AND i.categoria_id = ${metalCategoriaId}
      AND me.data_hora BETWEEN ${inicioTs}::timestamptz AND ${fimTs}::timestamptz
  `;

  // 6. Saldo do pote antes do início do período
  const [saldoAnterior] = await sql`
    SELECT
      COALESCE(SUM(me.entrada), 0)::float8 - COALESCE(SUM(me.saida), 0)::float8 AS saldo
    FROM alissonerp.movimentacoes_estoque me
    JOIN alissonerp.insumos i ON i.id = me.insumo_id
    WHERE me.deposito_id = ${almoxarifadoId}
      AND i.categoria_id = ${metalCategoriaId}
      AND me.data_hora < ${inicioTs}::timestamptz
  `;

  const saldoAtual = saldoPote.reduce((s, r) => s + Number(r.saldo_g), 0);

  return NextResponse.json({
    periodo: { inicio, fim },
    ordens: ordens ?? { concluidas: 0, em_producao: 0, aguardando: 0, canceladas: 0 },
    saldo_pote:        saldoPote,
    ouro_producao:     ouroProducao,
    quebra_operadores: quebraOperadores,
    financeiro: {
      saldo_anterior: Number(saldoAnterior?.saldo ?? 0),
      entradas:       Number(movimentacoes?.total_entradas ?? 0),
      saidas:         Number(movimentacoes?.total_saidas ?? 0),
      saldo_atual:    saldoAtual,
    },
  });
}
