-- Espessura (altura/height em mm) mínima por modelo de aliança.
--
-- JSONB com 7 chaves (uma por modelo). O input do editor de aliança usa
-- `min={espessura_minima_por_modelo[perfil]}` pra travar valores abaixo.
--
-- Default: 1.0mm em todos os modelos (aliança fina convencional).
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS espessura_minima_por_modelo JSONB
  DEFAULT '{
    "anatomica": 1.0,
    "boleada": 1.0,
    "boleada_double": 1.0,
    "chanfrada": 1.0,
    "concava": 1.0,
    "quadrado_canal": 1.0,
    "simples": 1.0
  }'::jsonb;

-- Garante que linhas existentes recebem o default
UPDATE alissonerp.config_orcamento
SET espessura_minima_por_modelo = '{
  "anatomica": 1.0,
  "boleada": 1.0,
  "boleada_double": 1.0,
  "chanfrada": 1.0,
  "concava": 1.0,
  "quadrado_canal": 1.0,
  "simples": 1.0
}'::jsonb
WHERE espessura_minima_por_modelo IS NULL;
