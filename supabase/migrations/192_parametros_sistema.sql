-- Migration 192: alissonerp.parametros_sistema
-- Centraliza IDs de domínio que estavam hardcoded em 29+ rotas
-- Aditiva: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING

CREATE TABLE IF NOT EXISTS alissonerp.parametros_sistema (
  chave        VARCHAR(100) PRIMARY KEY,
  valor        TEXT         NOT NULL,
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'number'
                 CHECK (tipo IN ('number', 'string', 'boolean', 'json')),
  descricao    TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por UUID REFERENCES alissonerp.usuarios(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION alissonerp.fn_atualizar_parametros_sistema()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_parametros_sistema
  ON alissonerp.parametros_sistema;

CREATE TRIGGER trg_atualizar_parametros_sistema
BEFORE UPDATE ON alissonerp.parametros_sistema
FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_atualizar_parametros_sistema();

-- Seed inicial (idempotente)
INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao) VALUES
  ('ALMOXARIFADO_DEPOSITO_ID', '1',   'number', 'ID do depósito Almoxarifado Central (pote)'),
  ('OURO_18K_INSUMO_ID',       '1',   'number', 'ID do insumo Ouro 18k Amarelo'),
  ('METAL_CATEGORIA_ID',       '1',   'number', 'ID da categoria Metal/Ouro'),
  ('PEDRA_CATEGORIA_ID',       '2',   'number', 'ID da categoria Pedras'),
  ('LOCAL_ESTOQUE_DEFAULT_ID', '1',   'number', 'ID padrão de local de estoque para inserts'),
  ('OURO_24K_LIGA_INSUMO_ID',  '275', 'number', 'ID do insumo Ouro 24k liga pura (purificação)')
ON CONFLICT (chave) DO NOTHING;

-- Permissão de leitura para todos (aplicação usa service role)
GRANT SELECT ON alissonerp.parametros_sistema TO authenticated, anon;
GRANT ALL    ON alissonerp.parametros_sistema TO service_role;
