-- ============================================================
-- scripts/fix_duplicate_items.sql
-- Corrige duplicatas em itens_venda_erp, total_venda, pagamentos
-- e contas_receber.
--
-- IDEMPOTENTE: seguro para re-executar.
-- Execute via: psql -h 72.60.55.140 -p 5543 -U postgres -d postgres -f scripts/fix_duplicate_items.sql
-- ============================================================

\echo '=== PASSO 0: Diagnostico pre-correcao ==='
SELECT
  'ANTES' as etapa,
  COUNT(*) as total_itens,
  COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, ''))) as distinct_groups
FROM alissonerp.itens_venda_erp
WHERE produto_id IS NOT NULL;

SELECT
  COUNT(DISTINCT venda_id) as vendas_com_duplicatas
FROM alissonerp.itens_venda_erp ive
WHERE produto_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM alissonerp.itens_venda_erp ive2
    WHERE ive2.venda_id = ive.venda_id
      AND ive2.produto_id = ive.produto_id
      AND COALESCE(ive2.sku, '') = COALESCE(ive.sku, '')
      AND ive2.id != ive.id
  );

\echo ''
\echo '=== PASSO 1: Removendo itens duplicados ==='
-- Mantem apenas o registro com menor id de cada grupo
DELETE FROM alissonerp.itens_venda_erp
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY venda_id, produto_id, COALESCE(sku, '')
             ORDER BY id
           ) as rn
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

\echo ''
\echo '=== PASSO 2: Re-sincronizando total_venda do public.vendas ==='
UPDATE alissonerp.vendas_erp ve
SET
  total_venda    = COALESCE(pv.total_venda, 0),
  total_produtos = COALESCE(pv.total_produtos, 0),
  total_frete    = COALESCE(pv.frete_pago_cliente, 0),
  total_comissao = COALESCE((
    SELECT SUM(valor_comissao)
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ve.id
  ), 0),
  updated_at = now()
FROM public.vendas pv
WHERE ve.public_venda_id = pv.id
  AND ve.public_venda_id IS NOT NULL;

\echo ''
\echo '=== PASSO 3: Cancelando pagamentos PENDENTES que excedem total ==='
UPDATE alissonerp.pagamentos_venda pg
SET status = 'cancelado'
FROM alissonerp.vendas_erp ve
WHERE pg.venda_id = ve.id
  AND pg.status = 'pendente'
  AND ve.public_venda_id IS NOT NULL
  AND pg.valor > ve.total_venda + 0.01;

\echo ''
\echo '=== PASSO 4: Ajustando pagamentos CONFIRMADOS que excedem total ==='
-- Se o unico pagamento confirmado excede o total_venda, reduz para o total
UPDATE alissonerp.pagamentos_venda pg
SET
  valor = ve.total_venda,
  gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || jsonb_build_object(
    'valor_original', pg.valor,
    'ajustado_em', to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    'motivo', 'Correcao: total_venda re-sincronizado do public.vendas'
  )
FROM alissonerp.vendas_erp ve
WHERE pg.venda_id = ve.id
  AND pg.status = 'confirmado'
  AND pg.data_confirmacao IS NOT NULL
  AND ve.public_venda_id IS NOT NULL
  AND pg.valor > ve.total_venda + 0.01
  -- So ajusta se este eh o unico pagamento confirmado da venda
  AND (
    SELECT COUNT(*) FROM alissonerp.pagamentos_venda p2
    WHERE p2.venda_id = ve.id
      AND p2.status = 'confirmado'
      AND p2.data_confirmacao IS NOT NULL
  ) = 1;

\echo ''
\echo '=== PASSO 5: Cancelando contas_receber com valor divergente ==='
UPDATE alissonerp.contas_receber cr
SET
  situacao = 'cancelado',
  observacoes = COALESCE(observacoes, '') || ' [Correcao total_venda ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']',
  updated_at = now()
FROM alissonerp.vendas_erp ve
WHERE cr.venda_erp_id = ve.id
  AND ve.public_venda_id IS NOT NULL
  AND cr.situacao IN ('pendente', 'pago')
  AND ABS(cr.valor - ve.total_venda) > 0.01;

\echo ''
\echo '=== PASSO 6: Diagnostico pos-correcao ==='
SELECT
  'DEPOIS' as etapa,
  COUNT(*) as total_itens,
  COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, ''))) as distinct_groups
FROM alissonerp.itens_venda_erp
WHERE produto_id IS NOT NULL;

SELECT
  COUNT(*) as vendas_ainda_divergentes
FROM alissonerp.vendas_erp ve
JOIN public.vendas pv ON pv.id = ve.public_venda_id
WHERE ABS(ve.total_venda - pv.total_venda) > 0.01;

\echo ''
\echo '=== CORRECAO CONCLUIDA ==='
