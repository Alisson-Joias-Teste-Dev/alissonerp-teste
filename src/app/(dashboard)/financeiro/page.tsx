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
        id, descricao, valor,
        data_vencimento::text  AS data_vencimento,
        data_recebimento::text AS data_recebimento,
        situacao, categoria, obs,
        created_at::text AS created_at
      FROM alissonerp.contas_receber
      ORDER BY data_vencimento ASC NULLS LAST, id DESC
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
