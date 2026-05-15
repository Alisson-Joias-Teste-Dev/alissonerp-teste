-- Nome customizável (label de exibição) por modelo de aliança.
--
-- A IDENTIDADE técnica do perfil continua sendo o enum ProfileType
-- (Anatomica, Boleada, BoleadaDouble, Chanfrada, Concava, QuadradoCanal,
-- Simples) — usado nos cálculos de peso e renderização do mesh. Esse JSONB
-- só altera o LABEL exibido nos botões de seleção e na config.
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS nomes_modelos JSONB
  DEFAULT '{
    "anatomica": "Anatomica",
    "boleada": "Boleada",
    "boleada_double": "Boleada DF",
    "chanfrada": "Chanfrada",
    "concava": "Concava",
    "quadrado_canal": "Bordas Elevadas",
    "simples": "Reta"
  }'::jsonb;

UPDATE alissonerp.config_orcamento
SET nomes_modelos = '{
  "anatomica": "Anatomica",
  "boleada": "Boleada",
  "boleada_double": "Boleada DF",
  "chanfrada": "Chanfrada",
  "concava": "Concava",
  "quadrado_canal": "Bordas Elevadas",
  "simples": "Reta"
}'::jsonb
WHERE nomes_modelos IS NULL;
