-- ============================================================
-- Migration 070: RLS correto para comentarios_ordem e notificacoes
-- ============================================================

SET search_path TO alissonerp;

-- ============================================================
-- COMENTÁRIOS DA ORDEM
-- RLS estava DESATIVADO — ativar e criar policies corretas
-- Qualquer autenticado lê todos os comentários de qualquer ordem
-- (controle de acesso à ordem fica na API/page.tsx)
-- ============================================================

ALTER TABLE alissonerp.comentarios_ordem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comentarios_select"  ON alissonerp.comentarios_ordem;
DROP POLICY IF EXISTS "comentarios_insert"  ON alissonerp.comentarios_ordem;
DROP POLICY IF EXISTS "comentarios_update"  ON alissonerp.comentarios_ordem;
DROP POLICY IF EXISTS "comentarios_delete"  ON alissonerp.comentarios_ordem;

-- Leitura: qualquer autenticado pode ver todos os comentários
CREATE POLICY "comentarios_select" ON alissonerp.comentarios_ordem
  FOR SELECT TO authenticated USING (true);

-- Inserção: apenas inserir como si mesmo
CREATE POLICY "comentarios_insert" ON alissonerp.comentarios_ordem
  FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());

-- Edição: apenas o autor
CREATE POLICY "comentarios_update" ON alissonerp.comentarios_ordem
  FOR UPDATE TO authenticated USING (autor_id = auth.uid());

-- Deleção: autor ou admin (admin verificado via fn_user_role)
CREATE POLICY "comentarios_delete" ON alissonerp.comentarios_ordem
  FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR (alissonerp.fn_user_role())::text IN ('admin', 'desenvolvedor'));

-- ============================================================
-- NOTIFICAÇÕES
-- Limpar policies legadas e recriar de forma clara
-- Coluna renomeada: user_id → usuario_id (migration 069)
-- ============================================================

-- Dropar todas as policies existentes para recomeçar limpo
DROP POLICY IF EXISTS "front-end"             ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "admin_full_notificacoes" ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "user_own_notificacoes" ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "notificacoes_select"   ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "notificacoes_insert"   ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "notificacoes_update"   ON alissonerp.notificacoes;
DROP POLICY IF EXISTS "notificacoes_delete"   ON alissonerp.notificacoes;

-- Leitura: cada usuário vê apenas as suas notificações
CREATE POLICY "notificacoes_select" ON alissonerp.notificacoes
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());

-- Inserção: a API insere via service role (direto SQL), mas liberar para authenticated tbm
CREATE POLICY "notificacoes_insert" ON alissonerp.notificacoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- Atualização: apenas o dono pode marcar como lida
CREATE POLICY "notificacoes_update" ON alissonerp.notificacoes
  FOR UPDATE TO authenticated USING (usuario_id = auth.uid());

-- Admin pode tudo
CREATE POLICY "notificacoes_admin" ON alissonerp.notificacoes
  FOR ALL TO authenticated
  USING ((alissonerp.fn_user_role())::text IN ('admin', 'desenvolvedor'))
  WITH CHECK ((alissonerp.fn_user_role())::text IN ('admin', 'desenvolvedor'));
