-- ============================================================
-- Migration 339 — Solicitações de ação do inventário (role operador_inventario)
--
-- O QUÊ: cria a tabela que guarda os PEDIDOS de ação no inventário feitos
--   pelo operador de inventário (Ytalo/Geovana): abrir, concluir e cancelar.
--   O pedido vira uma tarefa de aprovação (mesmo trilho de compra comercial/
--   desconto) e SÓ executa quando o administrador aprova.
-- POR QUÊ: regra do Jonathan — operador de inventário vê tudo do estoque e
--   conta via leitor RFID, mas NÃO edita nada direto; toda ação passa pela
--   aprovação dele. A frente "auditoria" (contagem manual) é separada.
-- IMPACTO SE REMOVIDO: as rotas de inventário quebram para a role
--   operador_inventario e o fluxo de aprovação some.
-- ============================================================

CREATE TABLE IF NOT EXISTS alissonerp.solicitacoes_inventario (
  id             SERIAL PRIMARY KEY,
  -- Qual ação foi pedida (o payload tem os dados exatos da ação)
  tipo_acao      VARCHAR(20) NOT NULL CHECK (tipo_acao IN ('abrir', 'concluir', 'cancelar')),
  -- Inventário alvo (NULL quando a ação é 'abrir' — ele ainda não existe)
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
