-- ============================================================
-- 123 — Lançamento avulso: permitir escolher local de estoque
-- ============================================================

-- 1. Adicionar coluna local_estoque_id na tabela lancamentos_avulso
ALTER TABLE alissonerp.lancamentos_avulso
  ADD COLUMN IF NOT EXISTS local_estoque_id INTEGER
    REFERENCES alissonerp.locais_estoque(id)
    DEFAULT 1;

-- 2. Atualizar trigger para usar o local informado
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
RETURNS TRIGGER AS $$
DECLARE
  v_dep_almox   INTEGER := 1;
  v_dep_destino INTEGER;
  v_local       INTEGER;
BEGIN
  v_local := COALESCE(NEW.local_estoque_id, 1);

  CASE NEW.tipo_lancamento::text

    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Deposito obrigatorio para transferencia avulsa';
      END IF;
      v_dep_destino := COALESCE(NEW.deposito_destino_id, v_dep_almox);
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_destino, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs, v_local
      );

    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, v_local);

    ELSE
      RAISE EXCEPTION 'Tipo de lancamento nao reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
