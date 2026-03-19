-- Migration 076: Edição completa de insumos
-- Adiciona colunas para suporte ao drawer de edição

-- Colunas de dados adicionais (peso_pedra e fornecedor_id já existem, mantemos IF NOT EXISTS por segurança)
ALTER TABLE alissonerp.insumos
  ADD COLUMN IF NOT EXISTS foto        TEXT,
  ADD COLUMN IF NOT EXISTS observacao  TEXT,
  ADD COLUMN IF NOT EXISTS sku_interno TEXT;

-- Garantir que as colunas existentes têm o tipo correto (peso_pedra já existe como real)
-- fornecedor_id já existe como bigint — sem alteração necessária

-- Bucket insumo-fotos (privado, para fotos dos insumos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insumo-fotos',
  'insumo-fotos',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;
