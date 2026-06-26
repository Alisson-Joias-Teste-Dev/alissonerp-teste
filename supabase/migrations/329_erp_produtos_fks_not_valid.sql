-- Migration 329: FKs de erp_produtos como NOT VALID (destrava a 323 na PROD)
--
-- O QUÊ: aplica as MESMAS FKs da migration 323, mas com NOT VALID — a constraint
--   passa a valer para dados NOVOS, tolerando as linhas órfãs que já existem.
-- POR QUÊ: a 323 (FK normal) falhou na PROD porque 3 produtos referenciados não
--   estão em erp_produtos (a 321 só migrou produtos COM SKU; estes não têm):
--     10914 "Aliança Bordas Elevadas... 5mm-19" (ATIVO)
--     39187 "Teste Evolur" (inativo, teste)
--     6259461 "Diamante Natural 1.0mm" (inativo)
--   ~8 linhas (conversao_itens, conversoes_sku, itens_ordem, joias_rfid,
--   produto_reposicao_config) apontam pra eles. Decisão Jonathan 22/06: IGNORAR
--   esses 3 (não tocar no dado) e seguir o deploy.
-- IMPACTO: integridade garantida dos NOVOS registros; os órfãos atuais ficam como
--   dívida. DEPOIS de limpar/migrar esses 3, rodar `VALIDATE CONSTRAINT` em cada FK.
-- NOTA: substitui a 323 na PROD. Em HOMOLOG a 323 (VALID) já está aplicada (lá não
--   havia órfãos) — não rodar a 329 no homolog.

-- Pré-requisito: UNIQUE(produto_id) em erp_produtos (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_produtos_produto_id_unique') THEN
    ALTER TABLE alissonerp.erp_produtos ADD CONSTRAINT erp_produtos_produto_id_unique UNIQUE (produto_id);
  END IF;
END $$;

ALTER TABLE alissonerp.conversao_itens
  DROP CONSTRAINT IF EXISTS conversao_itens_produto_id_fkey,
  ADD CONSTRAINT conversao_itens_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.conversoes_sku
  DROP CONSTRAINT IF EXISTS conversoes_sku_sku_origem_id_fkey,
  ADD CONSTRAINT conversoes_sku_sku_origem_id_fkey
    FOREIGN KEY (sku_origem_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.conversoes_sku
  DROP CONSTRAINT IF EXISTS conversoes_sku_sku_destino_id_fkey,
  ADD CONSTRAINT conversoes_sku_sku_destino_id_fkey
    FOREIGN KEY (sku_destino_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.itens_compra_comercial
  DROP CONSTRAINT IF EXISTS itens_compra_comercial_produto_id_fkey,
  ADD CONSTRAINT itens_compra_comercial_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.itens_ordem
  DROP CONSTRAINT IF EXISTS itens_ordem_produto_id_fkey,
  ADD CONSTRAINT itens_ordem_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.itens_ordem_produtos
  DROP CONSTRAINT IF EXISTS itens_ordem_produtos_produto_id_fkey,
  ADD CONSTRAINT itens_ordem_produtos_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.joias_rfid
  DROP CONSTRAINT IF EXISTS joias_rfid_produto_id_fkey,
  ADD CONSTRAINT joias_rfid_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE alissonerp.ordens
  DROP CONSTRAINT IF EXISTS ordens_produto_reposicao_id_fkey,
  ADD CONSTRAINT ordens_produto_reposicao_id_fkey
    FOREIGN KEY (produto_reposicao_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;

ALTER TABLE alissonerp.produto_personalizacao
  DROP CONSTRAINT IF EXISTS produto_personalizacao_produto_id_fkey,
  ADD CONSTRAINT produto_personalizacao_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE alissonerp.produto_reposicao_config
  DROP CONSTRAINT IF EXISTS produto_reposicao_config_produto_id_fkey,
  ADD CONSTRAINT produto_reposicao_config_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE alissonerp.produto_rota
  DROP CONSTRAINT IF EXISTS produto_rota_produto_id_fkey,
  ADD CONSTRAINT produto_rota_produto_id_fkey
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE CASCADE NOT VALID;

ALTER TABLE alissonerp.produto_upgrade_config
  DROP CONSTRAINT IF EXISTS fk_produto_upgrade_config_produto,
  ADD CONSTRAINT fk_produto_upgrade_config_produto
    FOREIGN KEY (produto_id) REFERENCES alissonerp.erp_produtos(produto_id) ON DELETE NO ACTION NOT VALID;
