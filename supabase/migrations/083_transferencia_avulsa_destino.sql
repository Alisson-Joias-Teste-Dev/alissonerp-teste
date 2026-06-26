-- Migration 083: Adicionar destino configurável na transferência avulsa
-- Antes: transferência sempre ia para almox (id=1) hardcoded no trigger
-- Agora:  deposito_destino_id define o destino; fallback = almox quando NULL

ALTER TABLE alissonerp.lancamentos_avulso
  ADD COLUMN IF NOT EXISTS deposito_destino_id INTEGER REFERENCES alissonerp.depositos(id);

-- Atualizar trigger para usar deposito_destino_id quando informado
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
RETURNS TRIGGER AS $$
DECLARE
  v_dep_almox  INTEGER := 1;
  v_dep_destino INTEGER;
BEGIN
  CASE NEW.tipo_lancamento::text

    -- TRANSFERÊNCIA AVULSA (TA): origem → destino (padrão = almox)
    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Depósito obrigatório para transferência avulsa';
      END IF;
      v_dep_destino := COALESCE(NEW.deposito_destino_id, v_dep_almox);
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_destino, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs
      );

    -- ENTRADA AVULSA (EA): entrada no depósito selecionado (sem par)
    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SAÍDA AVULSA (SA): saída do depósito selecionado (sem par)
    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SANGRIA: entrada no almoxarifado (recolhimento)
    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    ELSE
      RAISE EXCEPTION 'Tipo de lançamento não reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
