-- ============================================================================
-- Migration 375 — Produto personalizado (PZ) e sob encomenda: nao controla estoque
-- ============================================================================
-- Problema: a busca de produtos da venda so exibe item que atenda a UMA de:
--             a) estoque_comercial_config.controla_estoque = false
--             b) saldo comercial > 0
--             c) produto_reposicao_config.ativo = true
--           O cadastro "+ Personalizado" (POST /api/produtos/personalizados)
--           cria o produto com qtd_estoque = 0 e NAO cria linha em
--           estoque_comercial_config. Sem linha, o default e controla_estoque
--           = true, entao o item some da busca de venda.
--           Caso relatado: PZ0004 "Colar com Nome com diamantes" nao aparecia.
--
-- Regra confirmada pelo Alisson (27/08/2026): personalizado e sob encomenda,
-- portanto nao controla estoque.
--
-- Acao: backfill de todo produto com SKU PZ%%%% que ainda nao tem config.
--       A correcao da causa (cadastro passar a criar a linha) vai no endpoint.
--
-- Seguranca: apenas INSERT em linhas ausentes; ON CONFLICT DO NOTHING preserva
--            qualquer configuracao ja feita a mao (ex.: PZ0001, PZ0003).
-- ============================================================================

INSERT INTO alissonerp.estoque_comercial_config (produto_id, controla_estoque, estoque_minimo, ativo)
SELECT p.produto_id, false, 0, true
FROM alissonerp.erp_produtos p
WHERE p.sku ~ '^PZ\d{4}$'
ON CONFLICT (produto_id) DO NOTHING;

-- ============================================================================
-- Fim migration 375
-- ============================================================================
