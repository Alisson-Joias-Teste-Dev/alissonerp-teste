-- ============================================================
-- Aplicação da migration 339 em PRODUÇÃO — script tudo-em-um
--
-- O QUÊ: (1) cria a tabela solicitacoes_inventario, (2) dá a função
--   operador_inventario para Ytalo e Geovana, (3) configura o Jonathan
--   como aprovador dos pedidos de inventário.
-- POR QUÊ: operador de inventário vê tudo e conta via RFID, mas NÃO
--   edita nada direto — abrir/concluir/cancelar viram pedido que só
--   executa com a aprovação do administrador.
-- COMO RODAR: colar TUDO no SQL Editor do Supabase (um Run só).
--   Re-execução é segura (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

BEGIN;

-- 1) Etiqueta da conexão
SET LOCAL application_name = 'claude-code-alisson';

-- 2) Assinatura OBRIGATÓRIA no livro de mudanças (migration 303)
SELECT alissonerp.assinar_mudanca_banco(
  'alisson',
  'claude-code',
  'Migration 339 — solicitações de inventário (role operador_inventario): tabela solicitacoes_inventario, role para Ytalo/Geovana e config aprovador_inventario (Alisson)',
  'CREATE TABLE alissonerp.solicitacoes_inventario (pedidos abrir/concluir/cancelar com aprovacao via tarefas); UPDATE usuarios SET role=operador_inventario para geo@ e ytalo@alissonjoias.com.br; INSERT configuracoes_sistema aprovador_inventario = uuid do Alisson'
);

-- 3) A migration em si (tabela nova — não altera tabela existente, sem backup)
CREATE TABLE IF NOT EXISTS alissonerp.solicitacoes_inventario (
  id             SERIAL PRIMARY KEY,
  tipo_acao      VARCHAR(20) NOT NULL CHECK (tipo_acao IN ('abrir', 'concluir', 'cancelar')),
  inventario_id  INTEGER REFERENCES alissonerp.inventarios_comercial(id),
  payload        JSONB NOT NULL DEFAULT '{}',
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'executada', 'erro')),
  erro_execucao  TEXT,
  tarefa_id      INTEGER REFERENCES alissonerp.tarefas(id),
  solicitante_id UUID REFERENCES auth.users(id),
  decidido_por   UUID REFERENCES auth.users(id),
  decidido_em    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solic_inv_tarefa ON alissonerp.solicitacoes_inventario(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_solic_inv_status ON alissonerp.solicitacoes_inventario(status)
  WHERE status = 'pendente';

GRANT SELECT, INSERT, UPDATE ON alissonerp.solicitacoes_inventario TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.solicitacoes_inventario_id_seq TO authenticated;

COMMENT ON TABLE alissonerp.solicitacoes_inventario IS
  'Pedidos de ação no inventário feitos pela role operador_inventario. Executa SÓ após aprovação (tarefa vinculada). Aprovador vem de configuracoes_sistema.aprovador_inventario.';

-- 4) Função das operadoras de inventário (Ytalo e Geovana)
UPDATE alissonerp.usuarios
SET role = 'operador_inventario'
WHERE email IN ('geo@alissonjoias.com.br', 'ytalo@alissonjoias.com.br');

-- 5) Aprovador dos pedidos = Alisson
--    ⚠️ Se o SEU login no ERP não for este e-mail, troque abaixo pelo e-mail
--    que você usa para entrar no sistema.
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
SELECT 'aprovador_inventario', u.id::text,
       'UUID do usuário que aprova solicitações de inventário (operador_inventario)'
FROM alissonerp.usuarios u
WHERE u.email = 'allissonjoias@gmail.com' AND u.ativo = true
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

COMMIT;

-- 6) CONFERÊNCIA — deve mostrar: a tabela criada, as 2 operadoras e o aprovador
SELECT 'tabela' AS item, to_regclass('alissonerp.solicitacoes_inventario')::text AS valor
UNION ALL
SELECT 'operadora: ' || email, role FROM alissonerp.usuarios
WHERE email IN ('geo@alissonjoias.com.br', 'ytalo@alissonjoias.com.br')
UNION ALL
SELECT 'aprovador_inventario', valor FROM alissonerp.configuracoes_sistema
WHERE chave = 'aprovador_inventario';
