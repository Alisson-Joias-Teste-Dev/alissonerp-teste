-- =============================================
-- MIGRATION 072: user_profiles — UNIQUE em id_user + coluna avatar_url
-- Garante que o UPSERT ON CONFLICT (id_user) funcione
-- =============================================

-- 1. Garantir coluna avatar_url (pode não existir se tabela foi criada manualmente)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Garantir constraint UNIQUE em id_user (necessária para ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_profiles'::regclass
      AND contype IN ('u', 'p')  -- unique ou primary key
      AND conkey = ARRAY(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.user_profiles'::regclass
          AND attname = 'id_user'
      )
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_id_user_key UNIQUE (id_user);
    RAISE NOTICE 'Constraint UNIQUE criada em public.user_profiles(id_user)';
  ELSE
    RAISE NOTICE 'Constraint UNIQUE em id_user já existe — nada a fazer';
  END IF;
END $$;
