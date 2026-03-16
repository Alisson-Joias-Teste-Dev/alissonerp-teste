-- =============================================
-- MIGRATION 033: ENUM LABELS NA vw_fichas_tecnicas
-- Adiciona colunas *_label para campos numéricos da ficha técnica
-- Campos confirmados em directus.ficha_tecnica_ordem (2024-03):
--   numeracao (não numeracao_1), Outro_modelo_pingente, Altura_pingente (caps)
-- =============================================

DROP VIEW IF EXISTS alissonerp.vw_fichas_tecnicas;
CREATE VIEW alissonerp.vw_fichas_tecnicas AS
SELECT
  o.id           AS ordem_id,
  o.numero_ordem,
  ft.id          AS ficha_id,
  ft.date_created,
  ft.date_updated,

  -- ─── MEDIÇÕES ────────────────────────────────────────────────────────────
  ft.milimetragem_1,
  ft.milimetragem_2,
  ft.numeracao,
  ft.numeracao_2,
  ft.comprimento,

  -- ─── MODELO 1 ────────────────────────────────────────────────────────────
  ft.modelo_1,
  CASE ft.modelo_1
    WHEN '1'  THEN 'Safira (Quadrada Lisa)'
    WHEN '2'  THEN 'Esmeralda (Boleada Lisa)'
    WHEN '3'  THEN 'Cristal (risco em cada lateral)'
    WHEN '4'  THEN 'Opala (risco lateral)'
    WHEN '5'  THEN 'Turquesa (risco no meio)'
    WHEN '6'  THEN 'Granada (dois riscos mesma lateral)'
    WHEN '7'  THEN 'Água Marinha (friso lateral)'
    WHEN '8'  THEN 'Bordas Elevadas (centro cravejado)'
    WHEN '9'  THEN 'Jade (risco lateral, escovado)'
    WHEN '10' THEN 'Quartzo Rosa (bordas chanfradas)'
    WHEN '11' THEN 'Ametista (risco no meio)'
    WHEN '12' THEN 'Turmalina Paraíba (friso diamantado)'
    WHEN '13' THEN 'Friso + corda + meia lua de pedras'
    WHEN '14' THEN 'Dois frisos + corda'
    ELSE ft.modelo_1
  END AS modelo_1_label,

  ft.outro_modelo_1,

  -- ─── MODELO 2 ────────────────────────────────────────────────────────────
  ft.modelo_2,
  CASE ft.modelo_2
    WHEN '1'  THEN 'Safira (Quadrada Lisa)'
    WHEN '2'  THEN 'Esmeralda (Boleada Lisa)'
    WHEN '3'  THEN 'Cristal (risco em cada lateral)'
    WHEN '4'  THEN 'Opala (risco lateral)'
    WHEN '5'  THEN 'Turquesa (risco no meio)'
    WHEN '6'  THEN 'Granada (dois riscos mesma lateral)'
    WHEN '7'  THEN 'Água Marinha (friso lateral)'
    WHEN '8'  THEN 'Bordas Elevadas (centro cravejado)'
    WHEN '9'  THEN 'Jade (risco lateral, escovado)'
    WHEN '10' THEN 'Quartzo Rosa (bordas chanfradas)'
    WHEN '11' THEN 'Ametista (risco no meio)'
    WHEN '12' THEN 'Turmalina Paraíba (friso diamantado)'
    WHEN '13' THEN 'Friso + corda + meia lua de pedras'
    WHEN '14' THEN 'Dois frisos + corda'
    ELSE ft.modelo_2
  END AS modelo_2_label,

  ft.outro_modelo_2,

  -- ─── MODELO INTERNO ──────────────────────────────────────────────────────
  ft.modelo_interno_1,
  CASE ft.modelo_interno_1
    WHEN '2' THEN 'Confort'
    WHEN '3' THEN 'Reta'
    ELSE ft.modelo_interno_1
  END AS modelo_interno_1_label,

  ft.modelo_interno_2,
  CASE ft.modelo_interno_2
    WHEN '2' THEN 'Confort'
    WHEN '3' THEN 'Reta'
    ELSE ft.modelo_interno_2
  END AS modelo_interno_2_label,

  -- ─── FONTE / GRAVAÇÃO ────────────────────────────────────────────────────
  ft.tipo_fonte_1,
  CASE ft.tipo_fonte_1
    WHEN '1' THEN 'Forma'
    WHEN '2' THEN 'Cursiva'
    WHEN '3' THEN 'Sem Gravação'
    ELSE ft.tipo_fonte_1
  END AS tipo_fonte_1_label,

  ft.texto_tipo_fonte_1,

  ft.tipo_fonte_2,
  CASE ft.tipo_fonte_2
    WHEN '1' THEN 'Forma'
    WHEN '2' THEN 'Cursiva'
    WHEN '3' THEN 'Sem Gravação'
    ELSE ft.tipo_fonte_2
  END AS tipo_fonte_2_label,

  ft.texto_tipo_fonte_2,

  -- ─── ELO / FECHO ─────────────────────────────────────────────────────────
  ft.tipo_elo,
  CASE ft.tipo_elo
    WHEN '1'  THEN 'Cartier Quadrado'
    WHEN '2'  THEN 'Cartier Aberto'
    WHEN '3'  THEN 'Veneziano'
    WHEN '4'  THEN 'Piastrine'
    WHEN '5'  THEN 'Elo Português'
    WHEN '6'  THEN 'Cingapura'
    WHEN '7'  THEN 'Corda'
    WHEN '8'  THEN 'Bismarck'
    WHEN '9'  THEN 'Garimpeiro'
    WHEN '10' THEN 'Palmeira'
    WHEN '11' THEN 'Escama de Peixe'
    WHEN '12' THEN 'Grummert'
    WHEN '13' THEN 'Baguet'
    WHEN '14' THEN '3 em 1'
    WHEN '15' THEN 'Outros'
    ELSE ft.tipo_elo
  END AS tipo_elo_label,

  ft.outro_tipo_elo,

  ft.tipo_fecho,
  CASE ft.tipo_fecho
    WHEN '1' THEN 'Boia'
    WHEN '2' THEN 'Anzol'
    WHEN '3' THEN 'Batom'
    WHEN '4' THEN 'Caixa'
    WHEN '5' THEN 'Imã'
    WHEN '6' THEN 'Ouro'
    ELSE ft.tipo_fecho
  END AS tipo_fecho_label,

  ft.outro_tipo_fecho,

  -- ─── ANEL ─────────────────────────────────────────────────────────────────
  ft.modelo_anel,
  ft.milimetragem_da_base,
  ft.milimetragem_do_aro,
  ft.modelo_interno_anel,
  ft.modelo_externo_anel,

  -- ─── PINGENTE ────────────────────────────────────────────────────────────
  ft.modelo_pingente,
  CASE ft.modelo_pingente
    WHEN '1' THEN 'Crucifixo'
    WHEN '2' THEN 'Medalha'
    WHEN '3' THEN 'Ponto de Luz'
    WHEN '4' THEN 'Coração'
    WHEN '6' THEN 'Outro'
    ELSE ft.modelo_pingente
  END AS modelo_pingente_label,

  ft."Outro_modelo_pingente" AS outro_modelo_pingente,
  ft."Altura_pingente"       AS altura_pingente,
  ft.largura_pingente,

  -- ─── BRACELETE / PLACA / CHAPA ───────────────────────────────────────────
  ft.modelo_bracelete,
  ft.altura_placa,
  ft.largura_placa,
  ft.expessura_chapa,
  ft.nome_chapa,
  ft.tipo_tarraxa

FROM alissonerp.ordens o
JOIN directus.ordens          dor ON dor.id        = o.directus_ordem_id
JOIN directus.ficha_tecnica_ordem ft ON ft.id      = dor.ficha_tecnica_id;

-- Regarantir permissões (view foi recriada)
GRANT SELECT ON alissonerp.vw_fichas_tecnicas TO anon, authenticated;
