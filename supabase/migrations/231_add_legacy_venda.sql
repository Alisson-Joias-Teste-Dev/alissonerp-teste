-- Migration 231: adiciona suporte a vendas antigas (legacy) para garantia vitalicia
-- Adiciona coluna is_legacy, atualiza a view e cria indice

ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

-- Recria a view incluindo is_legacy
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
  COUNT(DISTINCT i.id)                                              AS qtd_itens,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado'), 0) AS total_pago
FROM alissonerp.vendas_erp v
LEFT JOIN public.contatos      c    ON c.id_contato   = v.cliente_id
LEFT JOIN public.vendedores    vend ON vend.id_vendedor = v.vendedor_id
LEFT JOIN alissonerp.itens_venda_erp   i ON i.venda_id = v.id
LEFT JOIN alissonerp.pagamentos_venda  p ON p.venda_id = v.id
GROUP BY
  v.id,
  c.nome, c.cpf_cnpj, c.email, c.telefone,
  vend.nome;

GRANT SELECT ON alissonerp.vw_vendas_erp_completa TO authenticated;

-- Indice para filtrar vendas legacy com eficiencia
CREATE INDEX IF NOT EXISTS idx_vendas_erp_is_legacy
  ON alissonerp.vendas_erp (is_legacy);
