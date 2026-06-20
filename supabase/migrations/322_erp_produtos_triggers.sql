-- Migration 322: Recria os 7 triggers de public.produtos em alissonerp.erp_produtos
--
-- O QUÊ: Cria os mesmos triggers que existem em public.produtos, agora apontando
--         para alissonerp.erp_produtos. As funções de trigger permanecem em public.*
--         pois são genéricas (usam NEW.*/OLD.* sem referenciar a tabela pelo nome).
-- POR QUÊ: Parte da migração de public.produtos -> erp_produtos. Quando o código
--           passar a escrever em erp_produtos, os triggers precisam estar lá.
-- IMPACTO: Nenhum efeito colateral agora — erp_produtos ainda não é escrita pelo código.
--           Os triggers em public.produtos continuam ativos (não são removidos aqui).

-- ── BEFORE INSERT OR UPDATE ──────────────────────────────────────────────────

-- 1. Arredonda peso_precificado para 1 casa decimal (sempre para cima)
CREATE OR REPLACE TRIGGER trigger_arredondar_peso
  BEFORE INSERT OR UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.arredondar_peso_para_cima();

-- 2. Calcula custo_na_cotacao, preco_na_cotacao, preco_sync a partir de peso/fator/markup/metal
CREATE OR REPLACE TRIGGER trigger_atualizar_preco_produto
  BEFORE INSERT OR UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_preco_produto();

-- 3. Calcula diferenca_percentual entre preco_tiny e preco_sync
CREATE OR REPLACE TRIGGER z_trigger_atualiza_diferenca_percentual
  BEFORE INSERT OR UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.calcular_diferenca_percentual();

-- 4. Seta data_atualizacao = now() a cada UPDATE
CREATE OR REPLACE TRIGGER on_erp_produtos_update
  BEFORE UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_modificacao_produtos();

-- ── AFTER UPDATE ─────────────────────────────────────────────────────────────

-- 5. Dispara webhook ETL quando tipo_metal, peso, fornecedor_etl ou tipo_de_pedra mudam
CREATE OR REPLACE TRIGGER on_erp_produto_update_obs
  AFTER UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.atualiza_obs_produto();

-- 6. pg_notify para n8n quando situacao muda
CREATE OR REPLACE TRIGGER on_erp_produto_update_notify_situacao
  AFTER UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.notificar_apenas_mudanca_situacao();

-- 7. Webhook ETL quando estoque_minimo, estoque_maximo ou sob_encomenda mudam
CREATE OR REPLACE TRIGGER trg_notifica_estoque_erp
  AFTER UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW EXECUTE FUNCTION public.notificar_mudanca_estoque();
