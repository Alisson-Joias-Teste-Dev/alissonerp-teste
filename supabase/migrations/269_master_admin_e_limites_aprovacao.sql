-- =============================================
-- Migration 269 — Master Admin imutavel + regra de aprovacao intermediaria
-- =============================================
-- Endereça vulnerabilidade do pentest: a função encontrarAprovador retornava
-- o primeiro admin ativo, podendo coincidir com o solicitante.
--
-- AUDITORIA DO BANCO mostrou que praticamente TUDO ja existe:
--   - tarefas_regras_aprovacao ja roteia "desconto > 30%" pro Alisson (id=1)
--   - tarefas_regras_aprovacao ja roteia "cartao_desconto > 20%" pro Alisson (id=2)
--   - usuarios.mx_desconto_permitido define limite por usuario (consultoras)
--   - alissonerp.audit_log + trg_audit_ordens captura cancelamentos automatico
--   - ordens.detalhes_ordem (TEXT) cabe motivo de cancelamento (concatenado)
--
-- Logo esta migration eh MINIMA. So adiciona:
--   1) Constante MASTER_ADMIN_USER_ID em parametros_sistema (single source para
--      isMasterAdmin no codigo, sem precisar JOIN com regras).
--   2) Regra intermediaria "Desconto acima de 20% -> admin" (gerentes loja ja
--      tem mx_desconto_permitido individual; isto blinda o escalonamento).
--   3) Trigger fn_proteger_master_admin bloqueia UPDATE/DELETE da chave
--      MASTER_ADMIN_USER_ID por qualquer um que nao seja o proprio master.
--
-- Codigo correspondente: src/lib/master-admin.ts + src/lib/aprovacao-regras.ts.
-- =============================================

-- ─── 1) Master admin (UUID do Alisson Ranyel) ────────────────────────────────
INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
VALUES (
  'MASTER_ADMIN_USER_ID',
  '684b3b30-6a7e-476e-ad3b-529127393183',
  'uuid',
  'UUID do administrador master (Alisson). Aprova qualquer coisa. Imutavel via trigger fn_proteger_master_admin.'
)
ON CONFLICT (chave) DO NOTHING;

-- ─── 2) Regra intermediaria de desconto (20%, aprovador_role=admin) ──────────
-- Atualiza a regra existente ou cria nova. Hoje so existe "Desconto >30% ->
-- Alisson". Adicionando "Desconto >20% -> admin" criamos o nivel intermediario:
-- gerente_loja com limite individual aprova ate o dele; entre limite_dele e
-- 30% vai pra admin; acima de 30% vai pro Alisson (regra existente id=1).
INSERT INTO alissonerp.tarefas_regras_aprovacao
  (nome, descricao, tipo_evento, condicao_json, aprovador_role, aprovador_id, ativo, prioridade_regra)
SELECT
  'Desconto acima de 20%',
  'Desconto entre 20% e 30% precisa de admin (gerente_loja so aprova o limite dele em mx_desconto_permitido).',
  'desconto_acima',
  '{"percentual": 20}'::jsonb,
  'admin',
  NULL,
  true,
  5  -- prioridade MENOR que a regra de 30% (id=1, prioridade=10). Regra de 30% pega primeiro.
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.tarefas_regras_aprovacao
  WHERE tipo_evento = 'desconto_acima'
    AND condicao_json @> '{"percentual": 20}'::jsonb
);

-- ─── 3) Trigger de protecao do master_admin_user_id ─────────────────────────
-- Bloqueia UPDATE/DELETE da chave MASTER_ADMIN_USER_ID a partir do app.
-- (Conexao direta como superuser ainda passa — defesa em camadas).
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_master_admin()
RETURNS TRIGGER AS $$
DECLARE
  master_id UUID;
  current_user_id UUID;
BEGIN
  -- So protege a chave MASTER_ADMIN_USER_ID
  IF COALESCE(OLD.chave, NEW.chave) <> 'MASTER_ADMIN_USER_ID' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  master_id := OLD.valor::uuid;
  current_user_id := auth.uid();

  IF current_user_id IS NULL OR current_user_id <> master_id THEN
    RAISE EXCEPTION 'Apenas o master admin pode alterar MASTER_ADMIN_USER_ID. (tentativa de %, master atual = %)',
      COALESCE(current_user_id::text, 'desconhecido'), master_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_master_admin ON alissonerp.parametros_sistema;
CREATE TRIGGER trg_proteger_master_admin
BEFORE UPDATE OR DELETE ON alissonerp.parametros_sistema
FOR EACH ROW
EXECUTE FUNCTION alissonerp.fn_proteger_master_admin();

-- ─── Sanity check ───────────────────────────────────────────────────────────
DO $$
DECLARE master_uuid TEXT; regra_count INTEGER;
BEGIN
  SELECT valor INTO master_uuid FROM alissonerp.parametros_sistema WHERE chave = 'MASTER_ADMIN_USER_ID';
  IF master_uuid IS NULL THEN
    RAISE EXCEPTION 'Migration 269 falhou: MASTER_ADMIN_USER_ID nao inserido';
  END IF;

  SELECT COUNT(*) INTO regra_count FROM alissonerp.tarefas_regras_aprovacao
   WHERE tipo_evento = 'desconto_acima' AND ativo = true;
  IF regra_count < 2 THEN
    RAISE WARNING 'Migration 269: esperado >=2 regras de desconto_acima (encontrado %)', regra_count;
  END IF;

  RAISE NOTICE 'Migration 269 OK. Master=%, regras_ativas=%', master_uuid, regra_count;
END $$;
