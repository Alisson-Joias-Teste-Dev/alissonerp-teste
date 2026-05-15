-- =============================================
-- MIGRATION 058: Seed configurações de precificação
--
-- Adiciona chaves de configuração de preço em alissonerp.configuracoes_sistema.
-- Estas chaves controlam os limiares do módulo de aprovação de preço (P3.2/P3.3).
-- =============================================

INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('preco_limiar_subir',    '2',      'Percentual mínimo de alta para disparar atualização de preço de venda (%)'),
  ('preco_limiar_descer',   '5',      'Percentual mínimo de queda para disparar atualização de preço de venda (%)'),
  ('preco_arredondamento',  'dezena', 'Tipo de arredondamento aplicado ao preco_sync: dezena | unidade | centena')
ON CONFLICT (chave) DO NOTHING;
