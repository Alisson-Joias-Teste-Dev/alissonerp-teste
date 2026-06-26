-- Adiciona suporte a PDF no bucket pagamento-fotos
-- REGRA DE NEGÓCIO: comprovantes de pagamento de compra de metal
-- podem ser arquivos PDF (não apenas imagens).
-- IMPACTO SE REMOVIDO: upload de comprovantes PDF falha com erro 415.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf'
]::text[]
WHERE id = 'pagamento-fotos';
