"""
Migração 001: Insumos
directus.insumos → alissonerp.insumos
Idempotente: pode rodar múltiplas vezes sem duplicar.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = False
cur = conn.cursor(cursor_factory=RealDictCursor)

def ok(msg):   print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}")
def info(msg): print(f"  \033[34mINFO\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("VALIDANDO PRÉ-CONDIÇÕES")
cur.execute("SELECT count(*) AS n FROM directus.insumos")
n_directus = cur.fetchone()['n']
info(f"directus.insumos: {n_directus} linhas")

cur.execute("SELECT count(*) AS n FROM alissonerp.insumos")
n_antes = cur.fetchone()['n']
info(f"alissonerp.insumos antes: {n_antes} linhas")

section("MIGRANDO INSUMOS")

SQL = """
INSERT INTO alissonerp.insumos (
    id, sku, nome, categoria_id, fornecedor_id,
    saldo, peso_pedra, peso_total,
    custo_compra, estoque_minimo, estoque_maximo,
    ativo, created_at
)
SELECT
    i.id,
    i.sku,
    COALESCE(i.nome, i.sku, 'Sem nome'),
    i.categoria_id,
    i.fornecedor_id,
    COALESCE(i.saldo, 0),
    COALESCE(i.peso_pedra, 0),
    COALESCE(i.peso_total, 0),
    COALESCE(i.custo_compra, 0),
    COALESCE(i.estoque_minimo, 0),
    COALESCE(i.estoque_maximo, 0),
    true,
    COALESCE(i.date_created, now())
FROM directus.insumos i
ON CONFLICT (id) DO NOTHING
"""

cur.execute(SQL)
inseridos = cur.rowcount
ok(f"Inseridos: {inseridos} insumos")

# Resetar sequence
cur.execute("SELECT setval('alissonerp.insumos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.insumos))")
cur.execute("SELECT currval('alissonerp.insumos_id_seq') AS seq")
seq = cur.fetchone()['seq']
ok(f"Sequence resetada para: {seq}")

conn.commit()

section("VALIDAÇÃO")
cur.execute("SELECT count(*) AS n FROM alissonerp.insumos")
n_depois = cur.fetchone()['n']
info(f"directus.insumos: {n_directus}")
info(f"alissonerp.insumos depois: {n_depois}")

if n_depois >= n_directus:
    ok(f"Contagem OK: {n_depois} >= {n_directus}")
else:
    fail(f"Contagem DIVERGE: directus={n_directus} alissonerp={n_depois}")

# Amostra
cur.execute("SELECT id, nome, saldo FROM alissonerp.insumos ORDER BY id LIMIT 5")
info("Amostra:")
for r in cur.fetchall():
    print(f"    id={r['id']:4d}  saldo={float(r['saldo'] or 0):8.3f}g  {r['nome']}")

conn.close()
print("\n  \033[32mMigração 001 — Insumos concluída.\033[0m")
