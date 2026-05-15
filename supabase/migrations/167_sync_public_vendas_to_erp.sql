-- Migration 167: Sincronizar vendas do Tiny (public.vendas) para alissonerp.vendas_erp
-- Permite que ordens de garantia/serviço referenciem vendas vindas do PDV Tiny.
-- Seguro para re-executar (usa public_venda_id como chave de deduplicação).
-- Requer search_path=alissonerp,public (triggers usam nomes não qualificados).

-- 1. Copiar vendas ainda não presentes no ERP
INSERT INTO alissonerp.vendas_erp (
  numero_venda, cliente_id, vendedor_id, data_venda,
  total_produtos, total_desconto, total_frete, total_venda, total_comissao,
  situacao, observacoes, observacoes_internas,
  tiny_pedido_id, tiny_sync_status, tiny_sync_at,
  bloqueado, created_at, updated_at, public_venda_id
)
SELECT
  COALESCE(v.numero_pedido::text, v.id::text),
  v.cliente_id,
  v.vendedor_id,
  v.data_venda,
  COALESCE(v.total_produtos, v.total_venda, 0),
  0,
  COALESCE(v.frete_pago_cliente::numeric, 0),
  COALESCE(v.total_venda, 0),
  0,
  'aprovado',
  v.observacoes,
  v.observacoes_internas,
  v.id_api_tiny,
  'sincronizado',
  NOW(),
  false,
  COALESCE(v.created_at, NOW()),
  NOW(),
  v.id
FROM public.vendas v
WHERE v.data_venda IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.vendas_erp ve WHERE ve.public_venda_id = v.id
  );

-- 2. Corrigir cliente_id/vendedor_id nulos em linhas já existentes
UPDATE alissonerp.vendas_erp ve
SET cliente_id  = pv.cliente_id,
    vendedor_id = pv.vendedor_id
FROM public.vendas pv
WHERE pv.id = ve.public_venda_id
  AND (ve.cliente_id IS NULL OR ve.vendedor_id IS NULL);

-- 3. Reativar vendas Tiny que ficaram canceladas/concluídas erroneamente
UPDATE alissonerp.vendas_erp ve
SET situacao = 'aprovado'
FROM public.vendas pv
WHERE pv.id = ve.public_venda_id
  AND ve.situacao IN ('cancelado', 'concluido');

-- 4. Copiar itens das vendas sincronizadas (exceto canceladas)
INSERT INTO alissonerp.itens_venda_erp (
  venda_id, produto_id, nome_produto, sku,
  quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
  pct_comissao, valor_comissao, created_at
)
SELECT
  ve.id,
  iv.produto_id,
  COALESCE(p.nome, 'Produto ' || iv.produto_id::text) AS nome_produto,
  p.sku,
  iv.quantidade::integer,
  iv.preco_unitario_final,
  COALESCE(iv.desconto_percentual, 0),
  iv.preco_unitario_final,
  COALESCE(iv.preco_total, iv.preco_unitario_final * iv.quantidade),
  COALESCE(iv.comissao_percentual, 0),
  COALESCE(iv.comissao_valor, 0),
  NOW()
FROM public.itens_venda iv
JOIN alissonerp.vendas_erp ve ON ve.public_venda_id = iv.venda_id
  AND ve.situacao != 'cancelado'
LEFT JOIN public.produtos p ON p.id_produto = iv.produto_id
WHERE iv.produto_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.itens_venda_erp ive
    WHERE ive.venda_id = ve.id AND ive.produto_id = iv.produto_id
  );
