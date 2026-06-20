-- Migration 323: Atualiza FKs de alissonerp.* para apontar para erp_produtos(produto_id)
--
-- O QUÊ: Remove FKs que apontam para public.produtos(id_produto) e recria apontando
--         para alissonerp.erp_produtos(produto_id). Apenas tabelas do schema alissonerp.
-- POR QUÊ: Parte da migração de public.produtos -> erp_produtos.
-- IMPACTO: FKs de public.* e directus.* permanecem em public.produtos (não podem ser
--           movidas sem risco — directus é READONLY, public tem dependências críticas).
--           public.produtos continuará como tabela real sincronizada (não pode ser VIEW
--           enquanto existirem FKs de directus/public apontando para ela).

-- Pré-requisito: UNIQUE em erp_produtos.produto_id para receber as FKs
ALTER TABLE alissonerp.erp_produtos
  ADD CONSTRAINT erp_produtos_produto_id_unique UNIQUE (produto_id);

-- ── conversao_itens ───────────────────────────────────────────────────────────
ALTER TABLE alissonerp.conversao_itens
  DROP CONSTRAINT IF EXISTS conversao_itens_produto_id_fkey,
  ADD CONSTRAINT conversao_itens_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── conversoes_sku ────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.conversoes_sku
  DROP CONSTRAINT IF EXISTS conversoes_sku_sku_origem_id_fkey,
  ADD CONSTRAINT conversoes_sku_sku_origem_id_fkey
    FOREIGN KEY (sku_origem_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

ALTER TABLE alissonerp.conversoes_sku
  DROP CONSTRAINT IF EXISTS conversoes_sku_sku_destino_id_fkey,
  ADD CONSTRAINT conversoes_sku_sku_destino_id_fkey
    FOREIGN KEY (sku_destino_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── itens_compra_comercial ────────────────────────────────────────────────────
ALTER TABLE alissonerp.itens_compra_comercial
  DROP CONSTRAINT IF EXISTS itens_compra_comercial_produto_id_fkey,
  ADD CONSTRAINT itens_compra_comercial_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── itens_ordem ───────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.itens_ordem
  DROP CONSTRAINT IF EXISTS itens_ordem_produto_id_fkey,
  ADD CONSTRAINT itens_ordem_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── itens_ordem_produtos ──────────────────────────────────────────────────────
ALTER TABLE alissonerp.itens_ordem_produtos
  DROP CONSTRAINT IF EXISTS itens_ordem_produtos_produto_id_fkey,
  ADD CONSTRAINT itens_ordem_produtos_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── joias_rfid ────────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.joias_rfid
  DROP CONSTRAINT IF EXISTS joias_rfid_produto_id_fkey,
  ADD CONSTRAINT joias_rfid_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE RESTRICT;

-- ── ordens (produto_reposicao_id) ─────────────────────────────────────────────
ALTER TABLE alissonerp.ordens
  DROP CONSTRAINT IF EXISTS ordens_produto_reposicao_id_fkey,
  ADD CONSTRAINT ordens_produto_reposicao_id_fkey
    FOREIGN KEY (produto_reposicao_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;

-- ── produto_personalizacao ────────────────────────────────────────────────────
ALTER TABLE alissonerp.produto_personalizacao
  DROP CONSTRAINT IF EXISTS produto_personalizacao_produto_id_fkey,
  ADD CONSTRAINT produto_personalizacao_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE CASCADE;

-- ── produto_reposicao_config ──────────────────────────────────────────────────
ALTER TABLE alissonerp.produto_reposicao_config
  DROP CONSTRAINT IF EXISTS produto_reposicao_config_produto_id_fkey,
  ADD CONSTRAINT produto_reposicao_config_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE CASCADE;

-- ── produto_rota ──────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.produto_rota
  DROP CONSTRAINT IF EXISTS produto_rota_produto_id_fkey,
  ADD CONSTRAINT produto_rota_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE CASCADE;

-- ── produto_upgrade_config ────────────────────────────────────────────────────
ALTER TABLE alissonerp.produto_upgrade_config
  DROP CONSTRAINT IF EXISTS fk_produto_upgrade_config_produto,
  ADD CONSTRAINT fk_produto_upgrade_config_produto
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id)
    ON DELETE NO ACTION;
