-- ============================================================
-- Migration 305 — VIGIA AUTOMÁTICO de mudanças de ESTRUTURA (DDL) no banco
--
-- ⚠️ APLICAR COMO SUPERUSUÁRIO. Gatilhos de evento (event triggers) exigem
--    superuser. Self-hosted: conectar no servidor onde o Supabase roda e rodar
--    como o postgres/supabase_admin superuser (ex.: dentro do container do banco).
--    NÃO roda pelo token do dia a dia (que é rebaixado de propósito).
--
-- REGRA DE NEGÓCIO:
--   O QUE: registra AUTOMATICAMENTE no livro (log_mudancas_banco, migration 303)
--     toda criação/alteração/remoção de view, função, tabela, trigger no schema
--     alissonerp/public — capturando IP de origem, usuário do banco e application_name.
--   POR QUE: o "livro de assinaturas" da 303 depende do agente QUERER assinar. Este
--     vigia NÃO depende de ninguém: o próprio banco grava sozinho, em toda mudança de
--     estrutura, de ONDE veio (IP). Mesmo que a IA do chefe não assine, a mudança dela
--     fica marcada com o IP da máquina dela — diferente do IP do Jonathan.
--   IMPACTO SE REMOVIDO: volta a depender de boa vontade; mudança de estrutura na mão
--     (ex.: editar uma view direto no banco) deixa de ser rastreada automaticamente.
-- ============================================================

-- ── 1) Vigia de CRIAÇÃO/ALTERAÇÃO (CREATE/ALTER/CREATE OR REPLACE) ──
CREATE OR REPLACE FUNCTION alissonerp.fn_vigia_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    -- só estrutura do nosso ERP / public; ignora schemas internos do Supabase (ruído)
    IF r.schema_name IS NOT NULL AND r.schema_name NOT IN ('alissonerp','public') THEN
      CONTINUE;
    END IF;
    -- não registra o próprio livro (evita poluir)
    IF COALESCE(r.object_identity,'') LIKE 'alissonerp.log_mudancas_banco%' THEN
      CONTINUE;
    END IF;
    INSERT INTO alissonerp.log_mudancas_banco
      (autor, agente, descricao, comando_sql, app_name, client_ip, db_user)
    VALUES (
      'auto-ddl',
      COALESCE(NULLIF(current_setting('application_name', true), ''), 'desconhecido'),
      format('Estrutura alterada: %s em %s', r.command_tag, COALESCE(r.object_identity, '?')),
      r.command_tag,
      NULLIF(current_setting('application_name', true), ''),
      inet_client_addr(),
      current_user
    );
  END LOOP;
END;
$$;

-- ── 2) Vigia de REMOÇÃO (DROP) ──
CREATE OR REPLACE FUNCTION alissonerp.fn_vigia_ddl_drop()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
    IF r.schema_name IS NOT NULL AND r.schema_name NOT IN ('alissonerp','public') THEN
      CONTINUE;
    END IF;
    IF r.object_type NOT IN ('table','view','materialized view','function','trigger','sequence','type') THEN
      CONTINUE;
    END IF;
    IF COALESCE(r.object_identity,'') LIKE 'alissonerp.log_mudancas_banco%' THEN
      CONTINUE;
    END IF;
    INSERT INTO alissonerp.log_mudancas_banco
      (autor, agente, descricao, comando_sql, app_name, client_ip, db_user)
    VALUES (
      'auto-ddl',
      COALESCE(NULLIF(current_setting('application_name', true), ''), 'desconhecido'),
      format('Estrutura REMOVIDA: %s %s', r.object_type, COALESCE(r.object_identity, '?')),
      'DROP ' || r.object_type,
      NULLIF(current_setting('application_name', true), ''),
      inet_client_addr(),
      current_user
    );
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_vigia_ddl;
CREATE EVENT TRIGGER trg_vigia_ddl
  ON ddl_command_end
  EXECUTE FUNCTION alissonerp.fn_vigia_ddl();

DROP EVENT TRIGGER IF EXISTS trg_vigia_ddl_drop;
CREATE EVENT TRIGGER trg_vigia_ddl_drop
  ON sql_drop
  EXECUTE FUNCTION alissonerp.fn_vigia_ddl_drop();

-- Assina a própria instalação do vigia (rastro de quem ligou).
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan', 'claude-code',
  'Migration 305: liga o vigia automatico de DDL (event triggers trg_vigia_ddl / trg_vigia_ddl_drop). Aplicada como superusuario no servidor.',
  'CREATE EVENT TRIGGER trg_vigia_ddl + trg_vigia_ddl_drop'
);

-- ============================================================
-- Fim migration 305 — rodar como SUPERUSUÁRIO
-- ============================================================
