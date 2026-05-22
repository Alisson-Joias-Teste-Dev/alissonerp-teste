-- =============================================
-- Migration 269 — Master Admin + Limites de Aprovação por Role
-- =============================================
-- Estabelece o conceito de "master admin" (único, imutável) e limites de
-- aprovação por role. Endereça vulnerabilidade encontrada em pentest:
--
--   "encontrarAprovador()" puxava o primeiro admin ativo. Se o solicitante
--    fosse admin, ele aparecia como aprovador e podia aprovar a propria
--    solicitação. Risco de fraude quando houver mais de um admin no sistema.
--
-- Decisão de negócio (Alisson):
--   - Master admin SEMPRE é o dono (UUID fixo abaixo). Imutável.
--   - Outros admins/gerentes aprovam descontos até um limite por role.
--   - Acima do limite, só master pode aprovar.
--
-- Fonte de verdade: alissonerp.parametros_sistema (chave/valor).
-- Consultado via src/lib/master-admin.ts no codigo.
-- =============================================

-- 1) Master admin: UUID do Alisson Ranyel
INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
VALUES (
  'MASTER_ADMIN_USER_ID',
  '684b3b30-6a7e-476e-ad3b-529127393183',
  'uuid',
  'UUID do administrador master (Alisson). Aprova qualquer coisa. Imutável.'
)
ON CONFLICT (chave) DO NOTHING;

-- 2) Limites de aprovação de desconto por role (em pontos percentuais)
-- Acima desses limites, somente o master aprova.

INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
VALUES (
  'DESCONTO_MAX_GERENTE_LOJA',
  '20',
  'numero',
  'Desconto maximo (%) que gerente_loja pode aprovar sem escalar pro master.'
)
ON CONFLICT (chave) DO NOTHING;

INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
VALUES (
  'DESCONTO_MAX_ADMIN',
  '30',
  'numero',
  'Desconto maximo (%) que admin (nao-master) pode aprovar. Acima -> master.'
)
ON CONFLICT (chave) DO NOTHING;

-- 3) Trigger: bloqueia UPDATE da chave MASTER_ADMIN_USER_ID por usuarios
-- que NAO sejam o proprio master. Camada extra contra alguem com acesso ao DB
-- tentar se promover. Note: nao impede SQL direto via superuser/postgres role
-- — apenas requests vindas da app (que rodam como o usuario autenticado).

CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_master_admin()
RETURNS TRIGGER AS $$
DECLARE
  master_id UUID;
  current_user_id UUID;
BEGIN
  -- So protege a chave MASTER_ADMIN_USER_ID
  IF OLD.chave <> 'MASTER_ADMIN_USER_ID' THEN
    RETURN NEW;
  END IF;

  -- Master atual
  master_id := OLD.valor::uuid;

  -- Quem esta tentando alterar? auth.uid() vem do Supabase JWT.
  -- Em conexao direta sem JWT (psql, scripts), auth.uid() = NULL — bloqueia.
  current_user_id := auth.uid();

  IF current_user_id IS NULL OR current_user_id <> master_id THEN
    RAISE EXCEPTION 'Apenas o master admin atual pode alterar MASTER_ADMIN_USER_ID. (tentativa de %, master = %)',
      COALESCE(current_user_id::text, 'desconhecido'), master_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_master_admin ON alissonerp.parametros_sistema;
CREATE TRIGGER trg_proteger_master_admin
BEFORE UPDATE OR DELETE ON alissonerp.parametros_sistema
FOR EACH ROW
EXECUTE FUNCTION alissonerp.fn_proteger_master_admin();

-- 4) Coluna cancelado_motivo em alissonerp.ordens
-- Quando master cancela ordem com apontamentos da fabrica, motivo eh
-- obrigatorio pra audit. Quando consultora cancela ordem sem apontamento,
-- motivo eh opcional (mas registrado se informado).
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT;

-- Sanity check no final
DO $$
DECLARE master_uuid TEXT;
BEGIN
  SELECT valor INTO master_uuid FROM alissonerp.parametros_sistema WHERE chave = 'MASTER_ADMIN_USER_ID';
  IF master_uuid IS NULL THEN
    RAISE EXCEPTION 'Migration 269 falhou: MASTER_ADMIN_USER_ID nao foi inserido';
  END IF;
  RAISE NOTICE 'Master admin configurado: %', master_uuid;
END $$;
