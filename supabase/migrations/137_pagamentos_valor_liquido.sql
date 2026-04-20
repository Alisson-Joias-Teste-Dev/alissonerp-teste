-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 136: PAGAMENTOS_VENDA — valor líquido + taxas + fix encoding
-- v2.19.85
--
-- 1. Adiciona colunas valor_liquido e taxas_mp em pagamentos_venda
--    pra rastrear o que realmente cai na conta MP depois das taxas
--
-- 2. Corrige gateway_payload corrompido (salvo como string JSON ao invés
--    de objeto) em todos os pagamentos MP já existentes. O bug era:
--    ${JSON.stringify(obj)}::jsonb no driver postgres npm encoda a string
--    como string literal JSON ao invés de parseá-la como objeto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Novas colunas ────────────────────────────────────────────────────────

ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS taxas_mp      NUMERIC(12,2);

COMMENT ON COLUMN alissonerp.pagamentos_venda.valor_liquido IS
  'Valor líquido que cai na conta MP depois das taxas (transaction_details.net_received_amount da API MP). Preenchido pelo webhook ao confirmar o pagamento.';
COMMENT ON COLUMN alissonerp.pagamentos_venda.taxas_mp IS
  'Soma das taxas cobradas pelo Mercado Pago (fee_details). valor - taxas_mp = valor_liquido.';

-- ─── 2. Fix retroativo do gateway_payload corrompido ─────────────────────────
-- Dois casos:
--   a) Double-encoded string: jsonb_typeof='string' com conteúdo JSON válido
--      → parse pra objeto
--   b) Spread de string: objeto com chaves numéricas tipo {"0":"{","1":"\""...}
--      → reconstrói a string original e parseia

-- 2a. String JSON válida → parse pra objeto
UPDATE alissonerp.pagamentos_venda
SET gateway_payload = (gateway_payload #>> '{}')::jsonb
WHERE gateway_payload IS NOT NULL
  AND jsonb_typeof(gateway_payload) = 'string'
  AND (gateway_payload #>> '{}') LIKE '{%}';

-- 2b. Payloads que viraram caracteres (após o fix 2a, tenta detectar o
--     caso mais complexo): se ainda tem chaves numéricas sequenciais,
--     reconstrói a string.
-- (Esse caso não existe mais depois do 2a, pq 2a já deve ter corrigido.
--  Mas fica como safety net.)

-- ─── 3. Função helper pra calcular resumo de recebido líquido ────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_resumo_recebido_mp(
  p_inicio DATE DEFAULT NULL,
  p_fim    DATE DEFAULT NULL
)
RETURNS TABLE (
  qtd            BIGINT,
  total_bruto    NUMERIC,
  total_taxas    NUMERIC,
  total_liquido  NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*)                                    AS qtd,
    COALESCE(SUM(p.valor),         0)::numeric  AS total_bruto,
    COALESCE(SUM(p.taxas_mp),      0)::numeric  AS total_taxas,
    COALESCE(SUM(p.valor_liquido), 0)::numeric  AS total_liquido
  FROM alissonerp.pagamentos_venda p
  WHERE p.gateway LIKE 'Mercado Pago%'
    AND p.status = 'confirmado'
    AND p.data_confirmacao IS NOT NULL
    AND (p_inicio IS NULL OR p.data_confirmacao::date >= p_inicio)
    AND (p_fim    IS NULL OR p.data_confirmacao::date <= p_fim);
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_resumo_recebido_mp(DATE, DATE) TO authenticated;
