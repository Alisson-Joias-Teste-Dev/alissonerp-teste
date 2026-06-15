-- ============================================================
-- Migration 303 — Livro de Registro de Mudanças no Banco (assinatura/atribuição)
--
-- REGRA DE NEGÓCIO:
--   O QUE: tabela onde TODO agente de IA que altera o banco DIRETAMENTE deve
--     registrar uma assinatura: QUEM autorizou, QUAL agente executou, O QUE mudou.
--   POR QUE: o token de acesso ao banco de produção é COMPARTILHADO entre a IA do
--     Jonathan (Claude Code) e a IA do chefe. Sem assinatura, o banco não sabe
--     QUEM mexeu. Isso protege o Jonathan: toda mudança que ele autoriza fica
--     assinada; se aparecer mudança SEM assinatura no livro, não foi ele.
--   IMPACTO SE REMOVIDO: volta a ser impossível atribuir mudanças manuais no banco
--     (views, funções, dados) a um responsável — sem defesa em caso de incidente.
--
-- Protocolo (ver CLAUDE.md, seção "Assinatura de Mudanças no Banco"):
--   ANTES de qualquer DDL/DML manual, chamar alissonerp.assinar_mudanca_banco(...).
-- ============================================================

-- Append-only: ninguém edita/apaga o histórico (à prova de adulteração).
CREATE TABLE IF NOT EXISTS alissonerp.log_mudancas_banco (
  id            bigserial   PRIMARY KEY,
  autor         text        NOT NULL,   -- quem AUTORIZOU: 'jonathan' | 'chefe' | ...
  agente        text        NOT NULL,   -- ferramenta executora: 'claude-code' | 'ia-chefe'
  descricao     text        NOT NULL,   -- o que mudou, em linguagem clara
  comando_sql   text,                   -- o SQL aplicado (íntegra ou resumo fiel)
  app_name      text        DEFAULT current_setting('application_name', true),
  client_ip     inet        DEFAULT inet_client_addr(),
  db_user       text        DEFAULT current_user,
  executado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.log_mudancas_banco IS
  'Livro de assinaturas de mudanças DIRETAS no banco (DDL/DML manual por agentes de IA com token compartilhado). Append-only. Protocolo: assinar ANTES de alterar. Ver CLAUDE.md.';

-- Helper para assinar de forma padronizada (captura app_name/IP/usuario sozinho).
CREATE OR REPLACE FUNCTION alissonerp.assinar_mudanca_banco(
  p_autor       text,
  p_agente      text,
  p_descricao   text,
  p_comando_sql text DEFAULT NULL
) RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO alissonerp.log_mudancas_banco (autor, agente, descricao, comando_sql)
  VALUES (p_autor, p_agente, p_descricao, p_comando_sql)
  RETURNING id;
$$;

-- Append-only guard: bloqueia UPDATE/DELETE no livro (histórico imutável).
CREATE OR REPLACE FUNCTION alissonerp.fn_log_mudancas_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'log_mudancas_banco é append-only: % não permitido', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mudancas_append_only ON alissonerp.log_mudancas_banco;
CREATE TRIGGER trg_log_mudancas_append_only
  BEFORE UPDATE OR DELETE ON alissonerp.log_mudancas_banco
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_log_mudancas_append_only();

-- Grants (append-only: SELECT + INSERT, nunca UPDATE/DELETE).
GRANT SELECT, INSERT ON alissonerp.log_mudancas_banco TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.log_mudancas_banco_id_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION alissonerp.assinar_mudanca_banco(text,text,text,text) TO authenticated, service_role;

-- Primeira assinatura: a própria criação deste livro.
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan',
  'claude-code',
  'Migration 303: cria o livro de registro de mudancas no banco (log_mudancas_banco), a funcao assinar_mudanca_banco e o guard append-only.',
  'CREATE TABLE alissonerp.log_mudancas_banco; CREATE FUNCTION assinar_mudanca_banco; CREATE TRIGGER trg_log_mudancas_append_only'
);

-- ============================================================
-- Fim migration 303
-- ============================================================
