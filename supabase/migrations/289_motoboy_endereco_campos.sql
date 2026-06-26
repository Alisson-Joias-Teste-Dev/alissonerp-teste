-- Migration 289: Quebra endereço do motoboy em campos individuais
--
-- REGRA DE NEGÓCIO: o endereço do motoboy é necessário para roteirização
-- e logística. Cada campo individual (rua, número, bairro, cidade, UF)
-- permite busca, filtro e integração com app de entregas.
-- A coluna `endereco` (TEXT livre) permanece por compatibilidade.
--
-- IMPACTO SE REMOVIDO: perde-se granularidade do endereço, impossibilitando
-- filtrar motoboys por bairro/cidade no app.

ALTER TABLE alissonerp.motoboys
  ADD COLUMN IF NOT EXISTS rua         TEXT,
  ADD COLUMN IF NOT EXISTS numero      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bairro      TEXT,
  ADD COLUMN IF NOT EXISTS cidade      TEXT,
  ADD COLUMN IF NOT EXISTS uf          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cep         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS complemento TEXT;
