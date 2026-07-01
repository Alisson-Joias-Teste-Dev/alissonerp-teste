-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL + PEÇA AUTOMÁTICA — produtos órfãos em public.produtos
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUÊ: (1) copia para public.produtos os 295 produtos ATIVOS que hoje existem
--   só na fonte de verdade (erp_produtos) e por isso somem das telas; (2) recria
--   a "peça automática" (trigger) que espelha TODO produto novo de erp_produtos
--   para public.produtos, pra o problema NÃO voltar a cada cadastro.
--
-- POR QUÊ: as telas de produto leem public.produtos. Vários caminhos de criação
--   (ex.: pedra avulsa) gravam SÓ em erp_produtos. Sem espelho, ficam invisíveis.
--   A trigger que fazia isso (migration 250) não existe mais no banco.
--
-- TRAVA DE SEGURANÇA (o ponto crítico): só INSERE produto que NÃO existe em
--   public (ON CONFLICT DO NOTHING). NUNCA faz UPDATE. Assim NÃO toca na coluna
--   `situacao` (nem preço) dos 15.798 produtos já existentes — que é a "verdade
--   viva" mantida pelo Tiny/site. Isso evita o bug de 6.108 produtos sumirem que
--   a vitrine-UNION causaria (ver docs/handoff-produtos-para-dev-2026-07-01.md §3).
--
-- Campos calculados (preco_sync, diferenca_percentual) e peso NÃO são copiados de
--   propósito: as triggers BEFORE INSERT de public.produtos (arredondar_peso,
--   atualizar_preco, diferenca_percentual) recalculam sozinhas, igual a um cadastro
--   normal.
--
-- IMPACTO SE REVERTIDA: os 295 voltam a sumir e novos produtos criados só em
--   erp_produtos ficam invisíveis de novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Assinatura obrigatória (CLAUDE.md)
SELECT alissonerp.assinar_mudanca_banco(
  'chefe',
  'claude-code',
  'Backfill de 295 produtos orfaos erp_produtos->public.produtos (INSERT-only, ON CONFLICT DO NOTHING) + recria trigger de espelho AFTER INSERT (nunca UPDATE, preserva situacao viva de public).',
  'INSERT INTO public.produtos (...) SELECT ... FROM erp_produtos WHERE NOT EXISTS em public ON CONFLICT DO NOTHING; + CREATE FUNCTION fn_espelhar_erp_para_public + CREATE TRIGGER trg_espelhar_erp_para_public AFTER INSERT ON erp_produtos'
);

-- ── PARTE 1: Backfill dos 295 órfãos ──────────────────────────────────────────
INSERT INTO public.produtos (
  id_produto, sku, nome, situacao, tipo, unidade, categoria, categoria_precificacao,
  tipo_metal, marca, gtin, peso_precificado, peso_real, markup, fator,
  preco_tiny, preco_promocional, preco_custo, preco_custo_medio, preco_na_cotacao,
  custo_na_cotacao, preco_pedras, preco_total_sync, tem_pedra_preciosa, tipo_de_pedra,
  imagem, imagem_capa, url_drive, iframe, prompt_imagem_ia, fornecedor_etl,
  fornecedor_id_api, id_kommo, id_api_produto, qtd_estoque, estoque_minimo,
  estoque_maximo, sob_encomenda, prazo_producao, data_ultima_compra
)
SELECT
  e.produto_id, e.sku, e.nome, e.situacao, e.tipo, e.unidade, e.categoria, e.categoria_precificacao,
  e.tipo_metal, e.marca, e.gtin, e.peso_precificado, e.peso_real, e.markup, e.fator,
  e.preco_tiny, e.preco_promocional, e.preco_custo, e.preco_custo_medio, e.preco_na_cotacao,
  e.custo_na_cotacao, e.preco_pedras, e.preco_total_sync, e.tem_pedra_preciosa, e.tipo_de_pedra,
  e.imagem, e.imagem_capa, e.url_drive, e.iframe, e.prompt_imagem_ia, e.fornecedor_etl,
  e.fornecedor_id_api, e.id_kommo, e.id_api_produto, e.qtd_estoque, e.estoque_minimo,
  e.estoque_maximo, e.sob_encomenda, e.prazo_producao, e.data_ultima_compra
FROM alissonerp.erp_produtos e
WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id_produto = e.produto_id)
ON CONFLICT (id_produto) DO NOTHING;

-- ── PARTE 2: Peça automática (trigger de espelho AFTER INSERT) ─────────────────
-- Só espelha produto NOVO (INSERT). ON CONFLICT DO NOTHING. Nunca UPDATE → não
-- estraga a situacao/preço viva dos produtos já existentes em public.
CREATE OR REPLACE FUNCTION alissonerp.fn_espelhar_erp_para_public()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.produtos (
    id_produto, sku, nome, situacao, tipo, unidade, categoria, categoria_precificacao,
    tipo_metal, marca, gtin, peso_precificado, peso_real, markup, fator,
    preco_tiny, preco_promocional, preco_custo, preco_custo_medio, preco_na_cotacao,
    custo_na_cotacao, preco_pedras, preco_total_sync, tem_pedra_preciosa, tipo_de_pedra,
    imagem, imagem_capa, url_drive, iframe, prompt_imagem_ia, fornecedor_etl,
    fornecedor_id_api, id_kommo, id_api_produto, qtd_estoque, estoque_minimo,
    estoque_maximo, sob_encomenda, prazo_producao, data_ultima_compra
  ) VALUES (
    NEW.produto_id, NEW.sku, NEW.nome, NEW.situacao, NEW.tipo, NEW.unidade, NEW.categoria, NEW.categoria_precificacao,
    NEW.tipo_metal, NEW.marca, NEW.gtin, NEW.peso_precificado, NEW.peso_real, NEW.markup, NEW.fator,
    NEW.preco_tiny, NEW.preco_promocional, NEW.preco_custo, NEW.preco_custo_medio, NEW.preco_na_cotacao,
    NEW.custo_na_cotacao, NEW.preco_pedras, NEW.preco_total_sync, NEW.tem_pedra_preciosa, NEW.tipo_de_pedra,
    NEW.imagem, NEW.imagem_capa, NEW.url_drive, NEW.iframe, NEW.prompt_imagem_ia, NEW.fornecedor_etl,
    NEW.fornecedor_id_api, NEW.id_kommo, NEW.id_api_produto, NEW.qtd_estoque, NEW.estoque_minimo,
    NEW.estoque_maximo, NEW.sob_encomenda, NEW.prazo_producao, NEW.data_ultima_compra
  )
  ON CONFLICT (id_produto) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_espelhar_erp_para_public ON alissonerp.erp_produtos;
CREATE TRIGGER trg_espelhar_erp_para_public
AFTER INSERT ON alissonerp.erp_produtos
FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_espelhar_erp_para_public();

-- ── CONFERÊNCIA (rodar depois; esperado: sumidos = 0) ─────────────────────────
-- SELECT COUNT(*) AS ainda_sumidos
-- FROM alissonerp.erp_produtos e
-- WHERE e.situacao='A' AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id_produto=e.produto_id);
-- SELECT sku, nome FROM public.produtos WHERE sku IN ('1846','1845','AJ5283');  -- devem aparecer
