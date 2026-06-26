-- 334_drop_sync_erp_to_public.sql
-- Fase C (FINAL) do plano docs/plano-cortar-public-produtos-2026-06.md
--
-- ⚠️ APLICAR POR ULTIMO. So rodar depois que 332 (views) + 333 (produtos_compat) +
-- o deploy do codigo (95 arquivos -> produtos_compat) estiverem LIVE em PROD e verificados.
-- Antes disso, dropar a trigger faria produto novo nao aparecer em quem ainda le public.produtos.
--
-- Corta o espelho: erp_produtos para de alimentar public.produtos.
-- public.produtos vira HISTORICO read-only (NAO dropada — decisao "manter legado").
-- A funcao fn_sync_erp_to_public_produto e mantida (inofensiva sem trigger; facil religar se preciso).
--
-- ROLLBACK (se necessario religar o espelho):
--   CREATE TRIGGER trg_sync_erp_to_public_produto
--     AFTER INSERT OR UPDATE ON alissonerp.erp_produtos
--     FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_erp_to_public_produto();
--   (conferir o evento/timing original com pg_get_triggerdef antes de dropar)

DROP TRIGGER IF EXISTS trg_sync_erp_to_public_produto ON alissonerp.erp_produtos;
