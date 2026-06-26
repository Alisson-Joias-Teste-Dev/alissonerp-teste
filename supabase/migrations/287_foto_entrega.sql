-- Migration 287: Adiciona foto_entrega_path na entrega
--
-- REGRA DE NEGÓCIO: toda confirmação de entrega (Código A ou Código B) pode
-- incluir uma foto como comprovante. A foto fica armazenada no bucket
-- pagamento-fotos do Supabase Storage e acessível via proxy autenticado.
--
-- IMPACTO SE REMOVIDO: perde-se comprovação visual de entrega, impossibilitando
-- auditoria de retiradas e entregas.

ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS foto_entrega_path TEXT;
