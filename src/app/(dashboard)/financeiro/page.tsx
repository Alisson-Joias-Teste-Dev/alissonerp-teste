import sql from "@/lib/db";
import FinanceiroClient from "./FinanceiroClient";

export const dynamic = 'force-dynamic';

export default async function FinanceiroPage() {
  // IMPORTANTE: colunas DATE/TIMESTAMP retornadas como ::text pra evitar
  // que o Next serialize como objeto Date (quebra isVencido() e outras
  // funções que fazem .slice() nas strings).
  const [pagar, receber, extratos, lancamentos] = await Promise.all([
    sql`
      SELECT
        id, descricao, valor,
        data_vencimento::text AS data_vencimento,
        data_pagamento::text  AS data_pagamento,
        situacao, categoria, obs,
        created_at::text AS created_at
      FROM alissonerp.contas_pagar
      ORDER BY data_vencimento ASC NULLS LAST, id DESC
      LIMIT 200
    `,
    sql`
      SELECT
        cr.id, cr.descricao, cr.valor,
        cr.data_vencimento::text  AS data_vencimento,
        cr.data_recebimento::text AS data_recebimento,
        cr.situacao, cr.categoria, cr.obs,
        cr.created_at::text AS created_at,
        cr.venda_erp_id,
        -- Soma de valor_liquido dos pagamentos MP confirmados da venda
        -- (NULL quando não há pagamento MP — ex: CRs de dinheiro, pix
        --  manual). Fallback pra valor bruto quando líquido não disponível.
        (
          SELECT SUM(p.valor_liquido)
          FROM alissonerp.pagamentos_venda p
          WHERE p.venda_id = cr.venda_erp_id
            AND p.status = 'confirmado'
            AND p.valor_liquido IS NOT NULL
        ) AS valor_liquido,
        (
          SELECT SUM(p.taxas_mp)
          FROM alissonerp.pagamentos_venda p
          WHERE p.venda_id = cr.venda_erp_id
            AND p.status = 'confirmado'
            AND p.taxas_mp IS NOT NULL
        ) AS taxas_mp
      FROM alissonerp.contas_receber cr
      ORDER BY cr.data_vencimento ASC NULLS LAST, cr.id DESC
      LIMIT 200
    `,
    sql`
      SELECT
        id, banco, agencia, conta,
        data_inicio::text AS data_inicio,
        data_fim::text    AS data_fim,
        arquivo_nome, processado, total_lancamentos,
        created_at::text AS created_at
      FROM alissonerp.fin_extratos_bancarios
      ORDER BY id DESC
      LIMIT 50
    `,
    sql`
      SELECT
        lb.id, lb.fitid, lb.tipo, lb.valor,
        lb.data_transacao::text AS data_transacao,
        lb.descricao, lb.memo, lb.conciliado,
        lb.extrato_id,
        e.banco
      FROM alissonerp.fin_lancamentos_bancarios lb
      LEFT JOIN alissonerp.fin_extratos_bancarios e ON e.id = lb.extrato_id
      ORDER BY lb.data_transacao DESC, lb.id DESC
      LIMIT 300
    `,
  ]);

  return (
    <FinanceiroClient
      pagar={pagar as any[]}
      receber={receber as any[]}
      extratos={extratos as any[]}
      lancamentos={lancamentos as any[]}
    />
  );
}
