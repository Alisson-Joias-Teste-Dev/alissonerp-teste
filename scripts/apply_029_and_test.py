"""
Migration 029: Corrigir enum_tipo_ordem
- Novo enum: servico, fabricacao, reposicao_venda, reposicao_loja,
             compra_fornecedor, garantia, servico_interno
- Migração de dados existentes (producao→fabricacao, reparo→servico, etc.)
- Views e funções atualizadas com novo mapeamento
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

def ok(msg):      print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg):    print(f"  \033[31mFAIL\033[0m {msg}"); sys.exit(1)
def warn(msg):    print(f"  \033[33mWARN\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "029_corrigir_enum_tipo_ordem.sql"
MIGRATION_SQL = mig_path.read_text(encoding="utf-8")

section("APLICANDO MIGRATION 029")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 029 executada sem erros")
except Exception as e:
    fail(f"Migration falhou: {e}")

# ─── Verificar enum ───────────────────────────────────────────────────────────
section("ENUM VALORES")
cur.execute("""
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'enum_tipo_ordem'
    ORDER BY e.enumsortorder
""")
labels = [r['enumlabel'] for r in cur.fetchall()]
expected = ['servico','fabricacao','reposicao_venda','reposicao_loja','compra_fornecedor','garantia','servico_interno']
for lbl in expected:
    if lbl in labels: ok(f"enum value '{lbl}' existe")
    else: fail(f"enum value '{lbl}' NÃO encontrado — labels={labels}")

# Garantir que valores antigos sumiram
old = ['producao','reparo','ajuste','banho','gravacao','reposicao','outro']
for lbl in old:
    if lbl in labels: fail(f"enum antigo '{lbl}' ainda existe!")
ok("Valores antigos removidos ✓")

# ─── Verificar contagem migrada ───────────────────────────────────────────────
section("DADOS MIGRADOS")
cur.execute("SELECT tipo_ordem::text, COUNT(*) AS n FROM alissonerp.ordens GROUP BY tipo_ordem ORDER BY n DESC")
rows = cur.fetchall()
for r in rows: print(f"  tipo='{r['tipo_ordem']}'  n={r['n']}")
ok(f"Total: {sum(r['n'] for r in rows)} ordens")

# ─── Verificar views ──────────────────────────────────────────────────────────
section("VIEWS")
views = ['vw_ordens_completa','vw_ordens_por_tipo','vw_ordem_detalhe',
         'vw_auditorias_completa','vw_dashboard_auditoria','vw_ordens_aguardando_auditoria_loja']
for vw in views:
    cur.execute("SELECT 1 FROM information_schema.views WHERE table_schema='alissonerp' AND table_name=%s", (vw,))
    if cur.fetchone(): ok(f"view {vw}")
    else: fail(f"view {vw} não encontrada")

# ─── Verificar labels corretos em vw_ordens_completa ─────────────────────────
section("LABELS vw_ordens_completa")
cur.execute("SELECT DISTINCT tipo_ordem FROM alissonerp.vw_ordens_completa ORDER BY tipo_ordem")
labels_vw = [r['tipo_ordem'] for r in cur.fetchall() if r['tipo_ordem']]
print(f"  Labels: {labels_vw}")
old_labels = ['Produção','Reparo','Ajuste','Banho','Gravação','Reposição','Outro']
for lbl in old_labels:
    if lbl in labels_vw: fail(f"Label antigo '{lbl}' ainda aparece na view!")
ok("Nenhum label antigo na view ✓")

new_labels_present = [l for l in labels_vw if l in ['Serviço','Fabricação','Reposição Venda','Reposição Loja','Compra de Fornecedor','Garantia','Serviço Interno']]
ok(f"Labels novos presentes: {new_labels_present}")

# ─── Verificar vw_ordens_por_tipo ────────────────────────────────────────────
section("vw_ordens_por_tipo")
cur.execute("SELECT tipo, total FROM alissonerp.vw_ordens_por_tipo")
for r in cur.fetchall(): print(f"  tipo='{r['tipo']}' total={r['total']}")
ok("vw_ordens_por_tipo OK")

# ─── Teste ponte PDV com tipo correto ────────────────────────────────────────
section("TESTE: INSERT directus tipo='2' → fabricacao")
NUMERO = "PDV-TESTE-029-TIPO"
cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem=%s)", (NUMERO,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO,))

cur.execute("""
    INSERT INTO directus.ordens (numero_ordem, situacao, status, tipo_ordem, rota)
    VALUES (%s, '2', '1', '2', '1')
    RETURNING id
""", (NUMERO,))
dir_id = cur.fetchone()['id']

cur.execute("SELECT tipo_ordem::text FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if not r: fail("Ordem não copiada")
if r['tipo_ordem'] != 'fabricacao': fail(f"tipo_ordem='{r['tipo_ordem']}' ≠ 'fabricacao'")
ok(f"tipo_ordem='fabricacao' ✓ (directus tipo_ordem='2')")

# Cleanup
cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem=%s)", (NUMERO,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
cur.execute("DELETE FROM directus.ordens WHERE id=%s", (dir_id,))
ok("Cleanup ✓")

section("Migration 029 OK — enum_tipo_ordem corrigido.")
conn.close()
