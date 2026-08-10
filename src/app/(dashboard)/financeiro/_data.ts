import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function getFinanceiroData() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const [usuario, pagar, receber, caixaPagamentos, caixaBaixas, comissoes, vendedores] = await Promise.all([
    user ? sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1` : Promise.resolve([]),
    sql`
      SELECT
        id, descricao, valor,
        data_vencimento::text AS data_vencimento,
        data_pagamento::text  AS data_pagamento,
        status AS situacao, categoria, observacao AS obs,
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
        cr.status AS situacao, cr.categoria, cr.observacao AS obs,
        cr.created_at::text AS created_at,
        cr.venda_erp_id,
        v.created_at::text  AS venda_created_at,
        v.numero_venda      AS venda_numero,
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
      LEFT JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
      ORDER BY cr.data_vencimento ASC NULLS LAST, cr.id DESC
      LIMIT 200
    `,
    sql`
      SELECT
        p.id,
        p.forma,
        p.valor,
        p.caixa_baixa_id,
        p.data_confirmacao::text AS data_confirmacao,
        v.numero_venda,
        v.id AS venda_id,
        vend.nome AS vendedor_nome,
        COALESCE(p.ouro_peso, p.ouro_gramas) AS ouro_gramas,
        p.ouro_valor_grama
      FROM alissonerp.pagamentos_venda p
      JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
      LEFT JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id
      WHERE p.status = 'confirmado'
        AND p.forma NOT IN ('Vale-Troca', 'A Receber')
      ORDER BY p.data_confirmacao DESC NULLS LAST, p.id DESC
      LIMIT 1000
    `,
    sql`
      SELECT
        id, total, qtd_pagamentos,
        realizado_nome, observacao AS obs,
        created_at::text AS created_at
      FROM alissonerp.fin_caixa_baixas
      ORDER BY id DESC
      LIMIT 50
    `,
    sql`
      SELECT
        fc.*,
        fc.id::text,
        fc.created_by::text,
        fc.approved_by::text,
        fc.created_at::text,
        fc.updated_at::text,
        fc.approved_at::text,
        fc.paid_at::text,
        fc.cancelled_at::text,
        (SELECT COUNT(*)::int FROM alissonerp.fechamento_comissao_itens fci WHERE fci.fechamento_id = fc.id) AS qtd_itens
      FROM alissonerp.fechamentos_comissao fc
      ORDER BY fc.created_at DESC
      LIMIT 100
    `,
    sql`
      SELECT id_vendedor, nome FROM public.vendedores WHERE situacao = 'Ativo' ORDER BY nome
    `,
  ]);

  return {
    userRole: (usuario as any[])[0]?.role ?? null,
    pagar:           pagar as any[],
    receber:         receber as any[],
    caixaPagamentos: caixaPagamentos as any[],
    caixaBaixas:     caixaBaixas as any[],
    comissoes:       comissoes as any[],
    vendedores:      vendedores as any[],
  };
}
