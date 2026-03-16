import sql from "@/lib/db";
import EstoqueClient from "@/components/EstoqueClient";

export default async function EstoquePage() {
  const [saldos, insumos, movimentacoes, parametros, saldoDepositos] =
    await Promise.all([
      sql`
        SELECT deposito_id, deposito_nome, insumo_id, insumo_nome, insumo_sku,
               categoria_nome, categoria_id,
               total_entrada, total_saida, saldo, total_movimentacoes
        FROM alissonerp.vw_estoque_directus_saldo
        WHERE saldo != 0
        ORDER BY ABS(saldo) DESC
      `,
      sql`
        SELECT
          insumo_id                                                   AS id,
          insumo_nome                                                 AS nome,
          sku,
          categoria_nome                                              AS categoria,
          categoria_id,
          saldo_real                                                  AS saldo,
          custo_compra,
          estoque_minimo,
          estoque_maximo,
          CASE
            WHEN saldo_real <= 0                                                         THEN 'critico'
            WHEN estoque_minimo > 0 AND saldo_real < estoque_minimo                     THEN 'critico'
            WHEN estoque_minimo > 0 AND saldo_real < estoque_minimo * 1.5               THEN 'atencao'
            ELSE 'ok'
          END                                                         AS status_estoque
        FROM alissonerp.vw_detalhe_pote
        WHERE ativo = true
        ORDER BY insumo_nome
      `,
      sql`
        SELECT id, entrada, saida, insumo_nome, deposito_nome, setor_nome,
               marcador, numero_ordem, obs, data_hora, date_created
        FROM alissonerp.vw_movimentacoes_directus
        ORDER BY date_created DESC
        LIMIT 100
      `,
      sql`SELECT cotacao_ouro, cotacao_dolar FROM alissonerp.parametros LIMIT 1`,
      sql`
        SELECT deposito_id, deposito_nome, total_entrada, total_saida, saldo
        FROM alissonerp.vw_quebra_por_deposito
        ORDER BY saldo DESC
      `,
    ]);

  return (
    <EstoqueClient
      saldos={saldos}
      insumos={insumos}
      movimentacoes={movimentacoes}
      cotacaoOuro={Number(parametros[0]?.cotacao_ouro ?? 0)}
      saldoDepositos={saldoDepositos}
    />
  );
}
