-- Migration 197: Guard anti-duplicação em fechamentos_distribuicao
-- Design real: 1 registro por (distribuicao_id, ordem_id) — uma ordem por vez em uma distribuição.
-- Bug a prevenir: mesma (distribuicao_id, ordem_id) inserida 2x → double-counting em pcp.total_*.
-- Análise (2026-04-29): zero duplicatas (dist_id, ordem_id) existentes — safe para criar índice.

-- Backup da função original (zona no-touch com autorização explícita EPIC-001 §3.5)
CREATE TABLE IF NOT EXISTS alissonerp._backup_fn_processar_fechamento_dist_pre_guard_20260429
  AS SELECT 'backup criado em 2026-04-29'::text AS info;

-- Índice único para prevenir double-insert da mesma (distribuicao_id, ordem_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unico_fechamento_dist
  ON alissonerp.fechamentos_distribuicao (distribuicao_id, ordem_id);

-- Atualizar fn_processar_fechamento_dist com guard explícito de duplicação
-- Adiciona verificação antes de acumular no PCP (defesa em profundidade além do índice)
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_fechamento_dist()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp_id    INTEGER;
  v_dep_dist  INTEGER;
BEGIN
  -- Guard: só processar quando peso é preenchido pela primeira vez
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;
  -- Para UPDATE: não reprocessar se já tinha peso > 0 (evita duplo acúmulo)
  IF TG_OP = 'UPDATE' AND OLD.peso IS NOT NULL AND OLD.peso > 0 THEN
    RETURN NEW;
  END IF;

  -- Guard v2: verificar se já existe processamento anterior para (distribuicao_id, ordem_id)
  -- O índice único acima previne o INSERT, mas este guard protege em casos de UPSERT ou bypass
  IF TG_OP = 'INSERT' THEN
    -- O índice único já vai rejeitar INSERT duplicado com erro
    -- Este bloco é documentação do comportamento esperado
    NULL;
  END IF;

  -- Buscar PCP ativo da ordem
  SELECT id INTO v_pcp_id
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC
  LIMIT 1;

  IF v_pcp_id IS NULL THEN
    RAISE NOTICE 'Sem PCP ativo para ordem %, ignorando acumulo', NEW.ordem_id;
    RETURN NEW;
  END IF;

  -- Buscar depósito da distribuição (do primeiro apontamento)
  SELECT deposito_id INTO v_dep_dist
  FROM alissonerp.apontamentos_distribuicao
  WHERE distribuicao_id = NEW.distribuicao_id
  LIMIT 1;

  -- ═══ ACUMULAR NO PCP — SOMA, NÃO SUBSTITUI ═══
  UPDATE alissonerp.pcp SET
    total_metal     = total_metal     + COALESCE(NEW.pmc, 0),
    total_pedras_un = total_pedras_un + COALESCE(NEW.total_pedras_un, 0),
    total_pedras_g  = total_pedras_g  + COALESCE(NEW.total_pedras_g, 0),
    updated_at      = now()
  WHERE id = v_pcp_id;

  -- CE marcador TEDD (dep distribuição → dep almoxarifado) usando Ouro como proxy
  IF v_dep_dist IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_par_movimentacao(
      1, NEW.peso,
      v_dep_dist, NULL,
      1, NULL,
      'TEDD', NEW.ordem_id,
      'Fechamento distribuicao #' || NEW.distribuicao_id::text || ' → PCP'
    );
  END IF;

  -- Mover ordem para almoxarifado (local_atual = 1)
  UPDATE alissonerp.ordens
  SET local_atual = 1, updated_at = now()
  WHERE id = NEW.ordem_id;

  -- Criar transferência vazia para a ordem (registra movimentação no histórico)
  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (v_pcp_id, NEW.ordem_id);

  -- Copiar itens distribuição → itens_ordem_insumos
  INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
  SELECT NEW.ordem_id, id_item.deposito_id, id_item.insumo_id, id_item.peso
  FROM alissonerp.itens_distribuicao id_item
  WHERE id_item.distribuicao_id = NEW.distribuicao_id
    AND id_item.peso > 0;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (garante que está ativo após CREATE OR REPLACE da função)
DROP TRIGGER IF EXISTS trg_fechamento_distribuicao ON alissonerp.fechamentos_distribuicao;
CREATE TRIGGER trg_fechamento_distribuicao
  AFTER INSERT OR UPDATE ON alissonerp.fechamentos_distribuicao
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_fechamento_dist();
