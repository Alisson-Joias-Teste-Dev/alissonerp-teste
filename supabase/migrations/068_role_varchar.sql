-- Migration 068: Migrar enum_role → VARCHAR(50) + tabela roles
-- Motivo: ENUM não permite criar/renomear roles dinamicamente.
-- alissonerp.roles passa a ser a fonte de verdade das roles válidas.
--
-- Ordem necessária (baseada em pg_depend real do banco):
--   1. DROP DEFAULT da coluna usuarios.role (referencia 'ourives'::enum_role)
--   2. ALTER TABLE usuarios.role → VARCHAR(50)
--   3. SET DEFAULT 'ourives' (sem enum)
--   4. DROP FUNCTION fn_handle_new_user() CASCADE → remove trigger
--   5. DROP TYPE enum_role CASCADE → remove fn_user_role + todas as 26 policies
--   6. Recriar fn_user_role RETURNS VARCHAR
--   7. Recriar fn_handle_new_user sem cast enum
--   8. Recriar trigger
--   9. Recriar todas as 26 RLS policies (sem ::enum_role)
--  10. Adicionar coluna ativo em role_permissoes
--  11. Criar tabela alissonerp.roles + seed

SET search_path TO alissonerp;

-- ─── 1-3. Alterar usuarios.role para VARCHAR ──────────────────────────────────
ALTER TABLE alissonerp.usuarios ALTER COLUMN role DROP DEFAULT;
ALTER TABLE alissonerp.usuarios ALTER COLUMN role TYPE VARCHAR(50) USING role::text;
ALTER TABLE alissonerp.usuarios ALTER COLUMN role SET DEFAULT 'ourives';

-- ─── 4. Remover fn_handle_new_user (usa enum no corpo; CASCADE remove trigger) ─
DROP FUNCTION IF EXISTS alissonerp.fn_handle_new_user() CASCADE;

-- ─── 5. Dropar o enum com CASCADE ────────────────────────────────────────────
-- CASCADE remove: fn_user_role (retorna enum_role) + todas as 26 policies
DROP TYPE alissonerp.enum_role CASCADE;

-- ─── 6. Recriar fn_user_role retornando VARCHAR ──────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_user_role()
RETURNS VARCHAR(50) AS $$
  SELECT role FROM alissonerp.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 7. Recriar fn_handle_new_user sem cast para enum ────────────────────────
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'ourives')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. Recriar trigger ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_handle_new_user();

-- ─── 9. Recriar as RLS policies (sem casts ::enum_role) ─────────────────────
-- Usar DROP IF EXISTS antes de cada CREATE para idempotência
-- (policies sem referência ao enum sobrevivem ao CASCADE do DROP TYPE)

-- apontamentos_distribuicao
DROP POLICY IF EXISTS "admin_full_apt_dist" ON alissonerp.apontamentos_distribuicao;
CREATE POLICY "admin_full_apt_dist" ON alissonerp.apontamentos_distribuicao
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

-- apontamentos_pcp
DROP POLICY IF EXISTS "admin_full_apt_pcp" ON alissonerp.apontamentos_pcp;
CREATE POLICY "admin_full_apt_pcp" ON alissonerp.apontamentos_pcp
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "ourives_apontamentos" ON alissonerp.apontamentos_pcp;
CREATE POLICY "ourives_apontamentos" ON alissonerp.apontamentos_pcp
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'ourives')
  WITH CHECK (alissonerp.fn_user_role() = 'ourives');

-- aprovacoes_consultora
DROP POLICY IF EXISTS "admin_full_aprovacoes" ON alissonerp.aprovacoes_consultora;
CREATE POLICY "admin_full_aprovacoes" ON alissonerp.aprovacoes_consultora
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "consultora_aprovacoes" ON alissonerp.aprovacoes_consultora;
CREATE POLICY "consultora_aprovacoes" ON alissonerp.aprovacoes_consultora
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'consultora');

-- auditorias
DROP POLICY IF EXISTS "admin_full_auditorias" ON alissonerp.auditorias;
CREATE POLICY "admin_full_auditorias" ON alissonerp.auditorias
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = ANY (ARRAY['admin','gerente_fabrica','gerente_loja']))
  WITH CHECK (alissonerp.fn_user_role() = ANY (ARRAY['admin','gerente_fabrica','gerente_loja']));

DROP POLICY IF EXISTS "read_auditorias" ON alissonerp.auditorias;
CREATE POLICY "read_auditorias" ON alissonerp.auditorias
  FOR SELECT TO authenticated
  USING (alissonerp.fn_user_role() = ANY (ARRAY['pcp','ourives','consultora']));

-- distribuicoes
DROP POLICY IF EXISTS "admin_full_distribuicoes" ON alissonerp.distribuicoes;
CREATE POLICY "admin_full_distribuicoes" ON alissonerp.distribuicoes
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "gerente_fab_distribuicoes" ON alissonerp.distribuicoes;
CREATE POLICY "gerente_fab_distribuicoes" ON alissonerp.distribuicoes
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'gerente_fabrica');

-- movimentacoes_estoque
DROP POLICY IF EXISTS "admin_full_mov_estoque" ON alissonerp.movimentacoes_estoque;
CREATE POLICY "admin_full_mov_estoque" ON alissonerp.movimentacoes_estoque
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "gerente_fab_estoque" ON alissonerp.movimentacoes_estoque;
CREATE POLICY "gerente_fab_estoque" ON alissonerp.movimentacoes_estoque
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'gerente_fabrica');

-- notificacoes
DROP POLICY IF EXISTS "admin_full_notificacoes" ON alissonerp.notificacoes;
CREATE POLICY "admin_full_notificacoes" ON alissonerp.notificacoes
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "user_own_notificacoes" ON alissonerp.notificacoes;
CREATE POLICY "user_own_notificacoes" ON alissonerp.notificacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ordem_comentarios
DROP POLICY IF EXISTS "admin_full_comentarios" ON alissonerp.ordem_comentarios;
CREATE POLICY "admin_full_comentarios" ON alissonerp.ordem_comentarios
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "all_read_comentarios" ON alissonerp.ordem_comentarios;
CREATE POLICY "all_read_comentarios" ON alissonerp.ordem_comentarios
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "author_write_comentarios" ON alissonerp.ordem_comentarios;
CREATE POLICY "author_write_comentarios" ON alissonerp.ordem_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ordens
DROP POLICY IF EXISTS "admin_full_ordens" ON alissonerp.ordens;
CREATE POLICY "admin_full_ordens" ON alissonerp.ordens
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "gerente_fab_ordens" ON alissonerp.ordens;
CREATE POLICY "gerente_fab_ordens" ON alissonerp.ordens
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'gerente_fabrica');

-- pcp
DROP POLICY IF EXISTS "admin_full_pcp" ON alissonerp.pcp;
CREATE POLICY "admin_full_pcp" ON alissonerp.pcp
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "gerente_fab_pcp" ON alissonerp.pcp;
CREATE POLICY "gerente_fab_pcp" ON alissonerp.pcp
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'gerente_fabrica');

DROP POLICY IF EXISTS "ourives_select_pcp" ON alissonerp.pcp;
CREATE POLICY "ourives_select_pcp" ON alissonerp.pcp
  FOR SELECT TO authenticated
  USING (alissonerp.fn_user_role() = 'ourives');

-- preparacoes_entrega
DROP POLICY IF EXISTS "admin_full_preparacoes" ON alissonerp.preparacoes_entrega;
CREATE POLICY "admin_full_preparacoes" ON alissonerp.preparacoes_entrega
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

-- protocolos
DROP POLICY IF EXISTS "admin_full_protocolos" ON alissonerp.protocolos;
CREATE POLICY "admin_full_protocolos" ON alissonerp.protocolos
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "gerente_fab_protocolos" ON alissonerp.protocolos;
CREATE POLICY "gerente_fab_protocolos" ON alissonerp.protocolos
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'gerente_fabrica');

DROP POLICY IF EXISTS "motoboy_select_protocolos" ON alissonerp.protocolos;
CREATE POLICY "motoboy_select_protocolos" ON alissonerp.protocolos
  FOR SELECT TO authenticated
  USING (alissonerp.fn_user_role() = 'motoboy');

DROP POLICY IF EXISTS "motoboy_update_protocolos" ON alissonerp.protocolos;
CREATE POLICY "motoboy_update_protocolos" ON alissonerp.protocolos
  FOR UPDATE TO authenticated
  USING (alissonerp.fn_user_role() = 'motoboy' AND motoboy_id = auth.uid());

-- transferencias_ordem
DROP POLICY IF EXISTS "admin_full_transf" ON alissonerp.transferencias_ordem;
CREATE POLICY "admin_full_transf" ON alissonerp.transferencias_ordem
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

-- usuarios
DROP POLICY IF EXISTS "admin_full_usuarios" ON alissonerp.usuarios;
CREATE POLICY "admin_full_usuarios" ON alissonerp.usuarios
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() = 'admin')
  WITH CHECK (alissonerp.fn_user_role() = 'admin');

DROP POLICY IF EXISTS "user_own_profile" ON alissonerp.usuarios;
CREATE POLICY "user_own_profile" ON alissonerp.usuarios
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "usuarios_select_own" ON alissonerp.usuarios;
CREATE POLICY "usuarios_select_own" ON alissonerp.usuarios
  FOR SELECT TO public
  USING (id = auth.uid() OR alissonerp.fn_user_role() = 'admin');

-- ─── 10. Coluna ativo em role_permissoes ─────────────────────────────────────
ALTER TABLE alissonerp.role_permissoes
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- ─── 11. Tabela de metadados das roles ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.roles (
  nome        VARCHAR(50)  PRIMARY KEY,
  descricao   VARCHAR(200),
  ativo       BOOLEAN      NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON alissonerp.roles TO authenticated;

-- ─── 12. Seed: 10 roles iniciais ─────────────────────────────────────────────
INSERT INTO alissonerp.roles (nome, descricao) VALUES
  ('desenvolvedor',      'Super-admin — acesso total ao sistema'),
  ('admin',              'Administrador — acesso total'),
  ('gerente_fabrica',    'Gerente de fábrica — produção, estoque, protocolo'),
  ('gerente_loja',       'Gerente de loja — ordens, protocolo, comercial'),
  ('ourives',            'Ourives / Artesão — PCP e apontamentos'),
  ('motoboy',            'Motoboy — logística e protocolo'),
  ('consultora',         'Consultora — ordens e conferência'),
  ('estoquista_fabrica', 'Estoquista fábrica — estoque e compras'),
  ('estoquista_loja',    'Estoquista loja — estoque'),
  ('pcp',                'Operador PCP — produção e distribuição')
ON CONFLICT (nome) DO NOTHING;
