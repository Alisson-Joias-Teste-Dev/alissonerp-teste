-- =============================================
-- MIGRATION 088: Coluna phone em public.user_profiles
-- EXCEÇÃO AUTORIZADA por Jonathan (23/03/2026)
-- Necessária para vinculação automática WhatsApp → usuário ERP
-- =============================================

-- Adiciona coluna phone (sem alterar nada existente)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Índice para lookup rápido no webhook
CREATE INDEX IF NOT EXISTS idx_user_profiles_phone
  ON public.user_profiles (phone)
  WHERE phone IS NOT NULL;

-- =============================================
-- APÓS RODAR ESTA MIGRATION:
-- Preencher manualmente os telefones da equipe:
--
-- UPDATE public.user_profiles SET phone = '5511999999999' WHERE id_user = '...';
-- UPDATE public.user_profiles SET phone = '5511988888888' WHERE id_user = '...';
-- ... (um UPDATE por membro da equipe)
--
-- Formato: código do país + DDD + número, sem espaços ou traços
-- Exemplo correto: '5511999999999'
-- =============================================
