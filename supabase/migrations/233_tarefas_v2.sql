-- Migration 233: Tarefas V2 — auditoria, anexos, templates, regras de aprovação, delegação
SET search_path TO alissonerp;

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. Atualizar CHECK constraint de status (suporta o ciclo completo)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE alissonerp.tarefas DROP CONSTRAINT IF EXISTS tarefas_status_check;
ALTER TABLE alissonerp.tarefas ADD CONSTRAINT tarefas_status_check
  CHECK (status IN (
    'pendente', 'em_andamento', 'aguardando_aprovacao',
    'aprovada', 'rejeitada', 'concluida', 'cancelada', 'vencida'
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. Garantir colunas usadas em código (podem ter sido adicionadas via ALTER direto)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS tipo VARCHAR(30);
ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS ordem_ids INTEGER[];
ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS peso_metal REAL;
ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS venda_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- C. Tarefas: Histórico (trilha de auditoria completa por tarefa)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.tarefas_historico (
  id             SERIAL PRIMARY KEY,
  tarefa_id      INTEGER NOT NULL REFERENCES alissonerp.tarefas(id) ON DELETE CASCADE,
  usuario_id     UUID REFERENCES auth.users(id),
  acao           VARCHAR(30) NOT NULL,
  campo          VARCHAR(50),
  valor_anterior TEXT,
  valor_novo     TEXT,
  comentario     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_historico_tarefa  ON alissonerp.tarefas_historico(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_historico_usuario ON alissonerp.tarefas_historico(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_historico_acao    ON alissonerp.tarefas_historico(acao);

-- ═══════════════════════════════════════════════════════════════════════════════
-- D. Tarefas: Anexos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.tarefas_anexos (
  id          SERIAL PRIMARY KEY,
  tarefa_id   INTEGER NOT NULL REFERENCES alissonerp.tarefas(id) ON DELETE CASCADE,
  usuario_id  UUID REFERENCES auth.users(id),
  nome        VARCHAR(255) NOT NULL,
  url         TEXT NOT NULL,
  tamanho     INTEGER,
  tipo_mime   VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_anexos_tarefa ON alissonerp.tarefas_anexos(tarefa_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- E. Tarefas: Templates
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.tarefas_templates (
  id                    SERIAL PRIMARY KEY,
  nome                  VARCHAR(100) NOT NULL,
  descricao             TEXT,
  titulo_padrao         TEXT NOT NULL,
  descricao_padrao      TEXT,
  prioridade            VARCHAR(10) DEFAULT 'media',
  responsavel_default_id UUID REFERENCES auth.users(id),
  tags                  TEXT[] DEFAULT '{}',
  tipo                  VARCHAR(30),
  ativo                 BOOLEAN DEFAULT true,
  criado_por            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_templates_ativo ON alissonerp.tarefas_templates(ativo);

-- ═══════════════════════════════════════════════════════════════════════════════
-- F. Tarefas: Regras de Aprovação configuráveis
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.tarefas_regras_aprovacao (
  id                SERIAL PRIMARY KEY,
  nome              VARCHAR(100) NOT NULL,
  descricao         TEXT,
  tipo_evento       VARCHAR(50) NOT NULL,
  condicao_json     JSONB NOT NULL DEFAULT '{}',
  aprovador_role    VARCHAR(50),
  aprovador_id      UUID REFERENCES auth.users(id),
  template_id       INTEGER REFERENCES alissonerp.tarefas_templates(id) ON DELETE SET NULL,
  ativo             BOOLEAN DEFAULT true,
  prioridade_regra  INTEGER DEFAULT 0,
  criado_por        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_regras_tipo   ON alissonerp.tarefas_regras_aprovacao(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_tarefas_regras_ativo  ON alissonerp.tarefas_regras_aprovacao(ativo);

-- ═══════════════════════════════════════════════════════════════════════════════
-- G. Tarefas: Substitutos temporários
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.tarefas_substitutos (
  id            SERIAL PRIMARY KEY,
  usuario_id    UUID NOT NULL REFERENCES auth.users(id),
  substituto_id UUID NOT NULL REFERENCES auth.users(id),
  inicio        DATE NOT NULL DEFAULT CURRENT_DATE,
  fim           DATE,
  ativo         BOOLEAN DEFAULT true,
  criado_por    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tarefas_substitutos_usuario    ON alissonerp.tarefas_substitutos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_substitutos_substituto ON alissonerp.tarefas_substitutos(substituto_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- H. Trigger: log automático de histórico em INSERT/UPDATE de tarefas
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_tarefas_historico()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO alissonerp.tarefas_historico (tarefa_id, usuario_id, acao, created_at)
    VALUES (NEW.id, NEW.criado_por, 'criada', now());
  ELSIF TG_OP = 'UPDATE' THEN
    -- Mudança de status
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO alissonerp.tarefas_historico (tarefa_id, usuario_id, acao, valor_anterior, valor_novo, created_at)
      VALUES (NEW.id, NEW.responsavel_id, NEW.status, OLD.status, NEW.status, now());
    END IF;
    -- Mudança de responsável
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO alissonerp.tarefas_historico (tarefa_id, usuario_id, acao, campo, valor_anterior, valor_novo, created_at)
      VALUES (NEW.id, COALESCE(NEW.criado_por, OLD.criado_por), 'atribuida', 'responsavel_id',
              OLD.responsavel_id::text, NEW.responsavel_id::text, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tarefas_historico ON alissonerp.tarefas;
CREATE TRIGGER trg_tarefas_historico
  AFTER INSERT OR UPDATE ON alissonerp.tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_tarefas_historico();

-- ═══════════════════════════════════════════════════════════════════════════════
-- I. Trigger: auto-marcar como vencida quando data_limite passa
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_tarefas_verificar_vencimento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_limite IS NOT NULL
     AND NEW.data_limite < CURRENT_DATE
     AND NEW.status NOT IN ('concluida', 'cancelada', 'vencida', 'aprovada') THEN
    NEW.status := 'vencida';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tarefas_verificar_vencimento ON alissonerp.tarefas;
CREATE TRIGGER trg_tarefas_verificar_vencimento
  BEFORE INSERT OR UPDATE ON alissonerp.tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_tarefas_verificar_vencimento();

-- ═══════════════════════════════════════════════════════════════════════════════
-- J. Grants
-- ═══════════════════════════════════════════════════════════════════════════════
GRANT SELECT, INSERT ON alissonerp.tarefas_historico TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_historico_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.tarefas_anexos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_anexos_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.tarefas_templates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_templates_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.tarefas_regras_aprovacao TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_regras_aprovacao_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.tarefas_substitutos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_substitutos_id_seq TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- K. Seed: templates padrão
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO alissonerp.tarefas_templates (nome, descricao, titulo_padrao, descricao_padrao, prioridade, tipo, tags, ativo) VALUES
  ('Aprovação de Desconto', 'Template para aprovação de desconto acima do limite',
   'Aprovar desconto — {venda_numero}',
   'Venda {venda_numero} com desconto acima de 30%\nTotal: {venda_total}\n\nItens com desconto:\n{itens_desconto}',
   'alta', 'desconto', '{aprovacao_desconto}', true),
  ('Aprovação de Crédito', 'Template para aprovação de crédito/venda a receber',
   'Aprovação crédito — {venda_numero} (R$ {valor_credito})',
   'Venda {venda_numero} — {cliente_nome}\nValor total: {venda_total}\nA Receber: {valor_credito}\nSolicitado por: {solicitante_nome}',
   'alta', 'credito', '{credito_loja}', true),
  ('Validação de Cadastro', 'Template para validação cadastral de cliente/fornecedor',
   'Validar cadastro — {entidade_nome}',
   'Novo cadastro de {tipo_entidade}: {entidade_nome}\nSolicitado por: {solicitante_nome}',
   'media', 'geral', '{validacao_cadastro}', true),
  ('Aprovação de Orçamento', 'Template para aprovação de orçamento acima do limite',
   'Aprovar orçamento — {orcamento_numero}',
   'Orçamento {orcamento_numero} no valor de {orcamento_total}\nCliente: {cliente_nome}\nSolicitado por: {solicitante_nome}',
   'alta', 'geral', '{aprovacao_orcamento}', true)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- L. Seed: regra de aprovação de desconto (migra lógica existente)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO alissonerp.tarefas_regras_aprovacao
  (nome, descricao, tipo_evento, condicao_json, aprovador_role, template_id, ativo, prioridade_regra)
SELECT
  'Desconto acima de 30%',
  'Cria tarefa de aprovação automaticamente quando desconto em item de venda ultrapassa 30%',
  'desconto_acima',
  '{"percentual": 30}',
  'admin',
  (SELECT id FROM alissonerp.tarefas_templates WHERE tipo = 'desconto' AND ativo = true LIMIT 1),
  true,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.tarefas_regras_aprovacao WHERE tipo_evento = 'desconto_acima'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- M. Seed: permissões role_permissoes para tarefas (roles que faltavam)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever) VALUES
  ('ourives',            'tarefas', true, true),
  ('consultora',         'tarefas', true, true),
  ('motoboy',            'tarefas', true, true),
  ('estoquista_fabrica', 'tarefas', true, true),
  ('estoquista_loja',    'tarefas', true, true),
  ('pcp',                'tarefas', true, true)
ON CONFLICT (role, modulo) DO UPDATE SET pode_ler = true, pode_escrever = true;
