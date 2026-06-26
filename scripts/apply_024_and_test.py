"""
Migration 024: Módulo Financeiro — contas_pagar, contas_receber, extratos OFX, conciliações
"""
import sys, os, pathlib
sys.stdout.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)

MIGRATION_SQL = """
SET search_path TO alissonerp;

-- ═══ CONTAS A PAGAR ═══
CREATE TABLE IF NOT EXISTS alissonerp.contas_pagar (
  id          SERIAL PRIMARY KEY,
  descricao   TEXT NOT NULL,
  fornecedor_id BIGINT REFERENCES public.contatos(id_contato),
  valor       DECIMAL(12,2) NOT NULL,
  data_vencimento DATE,
  data_pagamento  DATE,
  situacao    VARCHAR(20) DEFAULT 'pendente',
  categoria   VARCHAR(50),
  compra_id   INTEGER REFERENCES alissonerp.compras(id),
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cp_situacao   ON alissonerp.contas_pagar(situacao);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON alissonerp.contas_pagar(data_vencimento);

-- ═══ CONTAS A RECEBER ═══
CREATE TABLE IF NOT EXISTS alissonerp.contas_receber (
  id          SERIAL PRIMARY KEY,
  descricao   TEXT NOT NULL,
  cliente_id  BIGINT REFERENCES public.contatos(id_contato),
  venda_id    INTEGER REFERENCES public.vendas(id),
  valor       DECIMAL(12,2) NOT NULL,
  data_vencimento  DATE,
  data_recebimento DATE,
  situacao    VARCHAR(20) DEFAULT 'pendente',
  categoria   VARCHAR(50),
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cr_situacao   ON alissonerp.contas_receber(situacao);
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON alissonerp.contas_receber(data_vencimento);

-- ═══ EXTRATOS BANCÁRIOS (recebe OFX via n8n) ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_extratos_bancarios (
  id          SERIAL PRIMARY KEY,
  banco       VARCHAR(50),
  agencia     VARCHAR(20),
  conta       VARCHAR(30),
  data_inicio DATE,
  data_fim    DATE,
  arquivo_nome TEXT,
  arquivo_url  TEXT,
  processado   BOOLEAN DEFAULT false,
  total_lancamentos INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id)
);

-- ═══ LANÇAMENTOS BANCÁRIOS (criados pelo n8n a partir do OFX) ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_lancamentos_bancarios (
  id            SERIAL PRIMARY KEY,
  extrato_id    INTEGER REFERENCES alissonerp.fin_extratos_bancarios(id) ON DELETE CASCADE,
  fitid         VARCHAR(100) UNIQUE,
  tipo          VARCHAR(10),
  valor         DECIMAL(12,2) NOT NULL,
  data_transacao DATE,
  descricao     TEXT,
  memo          TEXT,
  conciliado    BOOLEAN DEFAULT false,
  conciliacao_id INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flb_fitid   ON alissonerp.fin_lancamentos_bancarios(fitid);
CREATE INDEX IF NOT EXISTS idx_flb_extrato ON alissonerp.fin_lancamentos_bancarios(extrato_id);
CREATE INDEX IF NOT EXISTS idx_flb_data    ON alissonerp.fin_lancamentos_bancarios(data_transacao);

-- ═══ CONCILIAÇÕES ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_conciliacoes (
  id               SERIAL PRIMARY KEY,
  lancamento_id    INTEGER REFERENCES alissonerp.fin_lancamentos_bancarios(id),
  conta_pagar_id   INTEGER REFERENCES alissonerp.contas_pagar(id),
  conta_receber_id INTEGER REFERENCES alissonerp.contas_receber(id),
  tipo    VARCHAR(20) DEFAULT 'manual',
  status  VARCHAR(20) DEFAULT 'pendente',
  obs     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- ═══ VIEW: resumo financeiro ═══
CREATE OR REPLACE VIEW alissonerp.vw_resumo_financeiro AS
SELECT
  'pagar'::text AS tipo,
  situacao,
  COUNT(*)::integer AS total,
  COALESCE(SUM(valor), 0) AS valor_total,
  COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE AND situacao = 'pendente' THEN valor ELSE 0 END), 0) AS vencido
FROM alissonerp.contas_pagar
GROUP BY situacao
UNION ALL
SELECT
  'receber'::text AS tipo,
  situacao,
  COUNT(*)::integer AS total,
  COALESCE(SUM(valor), 0) AS valor_total,
  COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE AND situacao = 'pendente' THEN valor ELSE 0 END), 0) AS vencido
FROM alissonerp.contas_receber
GROUP BY situacao;

-- ═══ VIEW: vendas enriquecida (cross-schema, readonly) ═══
CREATE OR REPLACE VIEW alissonerp.vw_vendas_completa AS
SELECT
  v.id,
  v.numero_pedido,
  v.data_venda,
  v.total_venda,
  v.total_produtos,
  v.total_itens_qnt,
  v.status,
  v.entregue,
  v.dados_pagamento,
  v.observacoes,
  c.nome  AS cliente_nome,
  c.cpf_cnpj AS cliente_cpf,
  ve.nome AS vendedor_nome,
  ve.id_vendedor AS vendedor_id
FROM public.vendas v
LEFT JOIN public.contatos  c  ON c.id_contato = v.cliente_id
LEFT JOIN public.vendedores ve ON ve.id_vendedor = v.vendedor_id;
"""

def ok(msg): print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("APLICANDO MIGRATION 024")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 024 executada")
except Exception as e:
    fail(f"Migration falhou: {e}")
    sys.exit(1)

mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "024_financeiro.sql"
mig_path.write_text(MIGRATION_SQL, encoding="utf-8")
ok(f"Arquivo salvo em {mig_path}")

section("VERIFICANDO TABELAS")
for tbl in ["contas_pagar","contas_receber","fin_extratos_bancarios","fin_lancamentos_bancarios","fin_conciliacoes"]:
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name=%s", (tbl,))
    if cur.fetchone(): ok(f"tabela {tbl}")
    else: fail(f"tabela {tbl} NAO ENCONTRADA")

section("VERIFICANDO VIEWS")
for vw in ["vw_resumo_financeiro","vw_vendas_completa"]:
    cur.execute("SELECT 1 FROM information_schema.views WHERE table_schema='alissonerp' AND table_name=%s", (vw,))
    if cur.fetchone(): ok(f"view {vw}")
    else: fail(f"view {vw} NAO ENCONTRADA")

section("TESTANDO VIEWS")
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.vw_vendas_completa")
n = cur.fetchone()["n"]
ok(f"vw_vendas_completa: {n} vendas acessíveis")

cur.execute("SELECT tipo, situacao, total, valor_total FROM alissonerp.vw_resumo_financeiro")
rows = cur.fetchall()
ok(f"vw_resumo_financeiro: {len(rows)} linhas (tabelas vazias = sem linhas é normal)")

section("TESTANDO INSERÇÃO BÁSICA")
# Conta a pagar de teste
cur.execute("""
    INSERT INTO alissonerp.contas_pagar (descricao, valor, data_vencimento, situacao)
    VALUES ('Teste fornecedor 024', 1500.00, CURRENT_DATE + 30, 'pendente')
    RETURNING id, situacao, valor
""")
cp = cur.fetchone()
ok(f"contas_pagar INSERT: id={cp['id']}, valor={cp['valor']}, situacao={cp['situacao']}")

# Conta a receber de teste
cur.execute("""
    INSERT INTO alissonerp.contas_receber (descricao, valor, data_vencimento, situacao)
    VALUES ('Venda teste 024', 3200.00, CURRENT_DATE + 15, 'pendente')
    RETURNING id, situacao, valor
""")
cr = cur.fetchone()
ok(f"contas_receber INSERT: id={cr['id']}, valor={cr['valor']}, situacao={cr['situacao']}")

# Extrato bancário de teste
cur.execute("""
    INSERT INTO alissonerp.fin_extratos_bancarios (banco, arquivo_nome, processado)
    VALUES ('Bradesco', 'extrato_teste.ofx', false)
    RETURNING id
""")
ext_id = cur.fetchone()["id"]

# Lançamento com fitid
cur.execute("""
    INSERT INTO alissonerp.fin_lancamentos_bancarios (extrato_id, fitid, tipo, valor, data_transacao, descricao)
    VALUES (%s, 'FIT-TEST-001', 'D', 1500.00, CURRENT_DATE, 'Pagamento fornecedor')
    RETURNING id, fitid, conciliado
""", (ext_id,))
lb = cur.fetchone()
ok(f"fin_lancamentos_bancarios INSERT: id={lb['id']}, fitid={lb['fitid']}, conciliado={lb['conciliado']}")

# Guard idempotência fitid
try:
    cur.execute("""
        INSERT INTO alissonerp.fin_lancamentos_bancarios (extrato_id, fitid, tipo, valor, data_transacao)
        VALUES (%s, 'FIT-TEST-001', 'D', 1500.00, CURRENT_DATE)
    """, (ext_id,))
    fail("Guard fitid UNIQUE não funcionou")
except psycopg2.errors.UniqueViolation:
    ok("Guard fitid UNIQUE: duplicata rejeitada")
    conn.rollback(); conn.autocommit = True

# Verificar resumo com dados
cur.execute("SELECT tipo, situacao, total, valor_total FROM alissonerp.vw_resumo_financeiro ORDER BY tipo, situacao")
rows = cur.fetchall()
ok(f"vw_resumo_financeiro com dados: {len(rows)} linhas")
for r in rows:
    print(f"    {r['tipo']:8s} | {r['situacao']:10s} | n={r['total']} | R$ {float(r['valor_total']):.2f}")

# Cleanup
cur.execute("DELETE FROM alissonerp.fin_lancamentos_bancarios WHERE fitid='FIT-TEST-001'")
cur.execute(f"DELETE FROM alissonerp.fin_extratos_bancarios WHERE id={ext_id}")
cur.execute(f"DELETE FROM alissonerp.contas_pagar WHERE id={cp['id']}")
cur.execute(f"DELETE FROM alissonerp.contas_receber WHERE id={cr['id']}")
ok("Dados de teste removidos")

print("\n  \033[32mMigration 024 OK — Módulo Financeiro pronto.\033[0m")
conn.close()
