-- ══════════════════════════════════════════════════════════════════════════
-- Migration 133 — Desacoplar friso dos perfis de aliança
-- ══════════════════════════════════════════════════════════════════════════
-- Objetivo: friso deixa de ser um perfil (FrisoUnico/FrisoLateral) e passa
-- a ser uma opção independente disponível em qualquer perfil de aliança.
--
-- Seguro: aditivo (ADD COLUMN IF NOT EXISTS), não altera dados existentes.
-- ══════════════════════════════════════════════════════════════════════════

-- Flag: aliança tem friso ativado
ALTER TABLE alissonerp.orcamento_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS has_friso BOOLEAN DEFAULT false;

-- Tipo de friso: lateral (um lado), centro (centralizado), duplo (ambos os lados)
ALTER TABLE alissonerp.orcamento_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS friso_tipo VARCHAR(20);

-- Variante: friso (sulco largo) ou risco (sulco fino, largura ~0.1mm)
ALTER TABLE alissonerp.orcamento_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS friso_kind VARCHAR(10) DEFAULT 'friso';

COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.friso_kind IS 'Variante: friso (sulco largo) ou risco (sulco fino ~0.1mm)';

-- Padrões do risco na config global
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS risco_width NUMERIC(5,2) DEFAULT 0.10;
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS risco_depth NUMERIC(5,2) DEFAULT 0.20;

-- Preço da gravação (nome/data) em R$ por aliança
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS preco_gravacao NUMERIC(10,2) DEFAULT 100.00;

-- Tabela de markups por pedra e tamanho (precificador)
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS stone_markups_table JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN alissonerp.config_orcamento.stone_markups_table IS 'Markups por pedra por tamanho. Ex: {"diamante":{"0":3.9,"1":3.7,...}}';

COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.has_friso IS 'Se true, aliança tem friso (groove) aplicado sobre o perfil base';
COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.friso_tipo IS 'Tipo de friso: lateral (um lado), centro (centralizado), duplo (ambos os lados)';
