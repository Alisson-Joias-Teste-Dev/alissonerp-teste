-- =============================================
-- MIGRATION 080: Sincronizar user_profiles.id_user com alissonerp.usuarios.id
--
-- Problema: user_profiles foi populado por um sistema legado com UUIDs diferentes
-- dos UUIDs de auth.users / alissonerp.usuarios.
-- O trigger handle_new_user em public é um stub (no-op) — nunca populou user_profiles.
--
-- Fix: para cada usuário onde o email bate entre as duas tabelas, atualizar
-- user_profiles.id_user para o valor correto (alissonerp.usuarios.id).
-- Isso sincroniza os dois schemas para que JOINs por id_user funcionem.
-- =============================================

-- Remover constraint UNIQUE temporariamente para permitir o UPDATE sem conflito
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_id_user_key;

-- Sincronizar: user_profiles.id_user → alissonerp.usuarios.id (match por email)
UPDATE public.user_profiles up
SET id_user    = u.id,
    updated_at = now()
FROM alissonerp.usuarios u
WHERE LOWER(up.email) = LOWER(u.email)
  AND up.id_user IS DISTINCT FROM u.id;

-- Restaurar constraint UNIQUE
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_id_user_key UNIQUE (id_user);

-- Verificação: mostrar usuários que ainda não têm correspondência
DO $$
DECLARE
  sem_match INTEGER;
BEGIN
  SELECT COUNT(*) INTO sem_match
  FROM alissonerp.usuarios u
  LEFT JOIN public.user_profiles up ON LOWER(up.email) = LOWER(u.email)
  WHERE up.id_user IS NULL OR up.id_user != u.id;

  IF sem_match > 0 THEN
    RAISE NOTICE 'ATENÇÃO: % usuário(s) em alissonerp.usuarios sem correspondência em user_profiles', sem_match;
  ELSE
    RAISE NOTICE 'OK: todos os usuários sincronizados';
  END IF;
END $$;
