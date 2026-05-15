-- ============================================================
-- Migration 236: Corrigir vw_vendas_erp_completa - total_pago
--                multiplicado por LEFT JOIN com itens
--
-- Problema: A view faz LEFT JOIN simultaneo com itens_venda_erp
-- E pagamentos_venda. Com 5 itens + 1 pagamento = 5 linhas,
-- SUM(p.valor) = 5 * 16000 = 80000 (errado).
--
-- Solucao: Usar subqueries para agregar itens e pagamentos
-- independentemente, eliminando o produto cartesiano.
-- ============================================================

DROP VIEW IF EXISTS alissonerp.vw_vendas_erp_completa;

CREATE VIEW alissonerp.vw_vendas_erp_completa AS
SELECT
  v.id,
  v.numero_venda,
  v.cliente_id,
  c.nome          AS cliente_nome,
  c.cpf_cnpj      AS cliente_cpf_cnpj,
  c.email         AS cliente_email,
  c.telefone      AS cliente_telefone,
  v.vendedor_id,
  vend.nome       AS vendedor_nome,
  v.data_venda,
  v.data_entrega,
  v.total_produtos,
  v.total_desconto,
  v.total_frete,
  v.total_venda,
  v.total_comissao,
  v.situacao,
  v.forma_envio,
  v.forma_frete,
  v.observacoes,
  v.observacoes_internas,
  v.video_obs_interna,
  v.tiny_pedido_id,
  v.tiny_sync_status,
  v.tiny_sync_at,
  v.tiny_sync_erro,
  v.bloqueado,
  v.is_legacy,
  v.created_by,
  v.created_at,
  v.updated_at,
  COALESCE((
    SELECT COUNT(*)
    FROM alissonerp.itens_venda_erp i
    WHERE i.venda_id = v.id
  ), 0) AS qtd_itens,
  COALESCE((
    SELECT SUM(p.valor)
    FROM alissonerp.pagamentos_venda p
    WHERE p.venda_id = v.id
      AND p.status = 'confirmado'
  ), 0) AS total_pago
FROM alissonerp.vendas_erp v
LEFT JOIN public.contatos   c    ON c.id_contato   = v.cliente_id
LEFT JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id;

GRANT SELECT ON alissonerp.vw_vendas_erp_completa TO authenticated;
