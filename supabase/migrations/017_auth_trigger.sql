
SET search_path TO alissonerp;

-- ═══ 1. FUNCTION: Auto-criar perfil quando auth.user é criado ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.usuarios (id, email, nome, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::alissonerp.enum_role,
      'ourives'::alissonerp.enum_role
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 2. TRIGGER no auth.users ═══
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_handle_new_user();

-- ═══ 3. AJUSTAR fn_user_role ═══
-- Retorna NULL se usuario nao cadastrado (nao bloqueia no dev)
CREATE OR REPLACE FUNCTION alissonerp.fn_user_role()
RETURNS alissonerp.enum_role AS $$
  SELECT role FROM alissonerp.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══ 4. DESABILITAR RLS nas tabelas de configuração ═══
-- Todos os usuarios autenticados podem ler config sem restricao
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['depositos','setores','tipos_apontamento','categorias_insumo','parametros','insumos']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'alissonerp' AND tablename = t AND rowsecurity = true
    ) THEN
      EXECUTE format('ALTER TABLE alissonerp.%I DISABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS desabilitado em alissonerp.%', t;
    END IF;
  END LOOP;
END $$;

-- ═══ 5. POLICY: usuarios podem ler proprio perfil ═══
-- Ja deve existir, mas garantir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'alissonerp' AND tablename = 'usuarios'
    AND policyname = 'usuarios_select_own'
  ) THEN
    CREATE POLICY "usuarios_select_own"
      ON alissonerp.usuarios FOR SELECT
      USING (id = auth.uid() OR alissonerp.fn_user_role() = 'admin');
  END IF;
END $$;
