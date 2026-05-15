"""
Migração 003: PCP + Saídas de Ordem
directus.saida_ordem  → alissonerp.saidas_ordem
directus.pcp          → alissonerp.pcp

Notas:
- directus.pcp.saida_ordem    → alissonerp.pcp.saida_ordem_id
- directus.pcp.Bloqueado      → alissonerp.pcp.bloqueado (lowercase)
- directus.saida_ordem sem coluna obs → inserido como NULL
- etapas: string '1'-'6' → enum_etapas_pcp
Idempotente via ON CONFLICT (id) DO NOTHING.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = False
cur = conn.cursor(cursor_factory=RealDictCursor)

def ok(msg):   print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}"); conn.rollback(); sys.exit(1)
def info(msg): print(f"  \033[34mINFO\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("PRÉ-CONDIÇÕES")
cur.execute("SELECT count(*) AS n FROM directus.saida_ordem")
n_saidas_dir = cur.fetchone()['n']
info(f"directus.saida_ordem: {n_saidas_dir}")
cur.execute("SELECT count(*) AS n FROM alissonerp.saidas_ordem")
info(f"alissonerp.saidas_ordem antes: {cur.fetchone()['n']}")

cur.execute("SELECT count(*) AS n FROM directus.pcp")
n_pcp_dir = cur.fetchone()['n']
info(f"directus.pcp: {n_pcp_dir}")
cur.execute("SELECT count(*) AS n FROM alissonerp.pcp")
info(f"alissonerp.pcp antes: {cur.fetchone()['n']}")

# ── MIGRAR SAÍDAS DE ORDEM ────────────────────────────────────────────────────
section("MIGRANDO SAÍDAS DE ORDEM")
cur.execute("ALTER TABLE alissonerp.saidas_ordem DISABLE TRIGGER trg_after_saida_ordem")
cur.execute("""
INSERT INTO alissonerp.saidas_ordem (
    id, ordem_id, deposito_id, peso,
    obs,
    created_at, updated_at, created_by
)
SELECT
    s.id,
    s.ordem_id,
    s.deposito_id,
    COALESCE(s.peso, 0),
    NULL,   -- directus.saida_ordem não tem coluna obs
    COALESCE(s.date_created, now()),
    COALESCE(s.date_updated, s.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_created) THEN s.user_created ELSE NULL END
FROM directus.saida_ordem s
WHERE EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = s.ordem_id)
ON CONFLICT (id) DO NOTHING
""")
n_saidas = cur.rowcount
ok(f"Inseridas: {n_saidas} saídas de ordem")

cur.execute("ALTER TABLE alissonerp.saidas_ordem ENABLE TRIGGER trg_after_saida_ordem")

# Resetar sequence
cur.execute("SELECT setval('alissonerp.saidas_ordem_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.saidas_ordem))")

# ── MIGRAR PCP ────────────────────────────────────────────────────────────────
section("MIGRANDO PCP")
cur.execute("ALTER TABLE alissonerp.pcp DISABLE TRIGGER trg_audit_pcp")

cur.execute("""
INSERT INTO alissonerp.pcp (
    id,
    etapas,
    ordem_id,
    saida_ordem_id,
    operador,
    bloqueado,
    local_atual,
    total_metal, retorno_metal,
    total_pedras_un, total_pedras_g,
    total_geral_outros_pesos, total_outros_pesos_g,
    pmc,
    quebra, porcentagem_de_quebra,
    peso_final, peso_unitario, quantidade,
    metal_externo,
    data_conclusao,
    created_at, updated_at,
    created_by, updated_by
)
SELECT
    p.id,
    CASE p.etapas
        WHEN '1' THEN 'novas_ordens'::alissonerp.enum_etapas_pcp
        WHEN '2' THEN 'pendencia'::alissonerp.enum_etapas_pcp
        WHEN '3' THEN 'aguardando'::alissonerp.enum_etapas_pcp
        WHEN '4' THEN 'em_andamento'::alissonerp.enum_etapas_pcp
        WHEN '5' THEN 'concluido'::alissonerp.enum_etapas_pcp
        WHEN '6' THEN 'cancelado'::alissonerp.enum_etapas_pcp
        ELSE 'novas_ordens'::alissonerp.enum_etapas_pcp
    END,
    p.ordem_id,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.saidas_ordem s WHERE s.id = p.saida_ordem) THEN p.saida_ordem ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.operador) THEN p.operador ELSE NULL END,
    COALESCE(p."Bloqueado", false),
    COALESCE(p.local_atual, false),
    COALESCE(p.total_metal, 0),
    COALESCE(p.retorno_metal, 0),
    COALESCE(p.total_pedras_un, 0),
    COALESCE(p.total_pedras_g, 0),
    COALESCE(p.total_geral_outros_pesos, 0),
    COALESCE(p.total_outros_pesos_g, 0),
    COALESCE(p.pmc, 0),
    COALESCE(p.quebra, 0),
    COALESCE(p.porcentagem_de_quebra, 0),
    COALESCE(p.peso_final, 0),
    COALESCE(p.peso_unitario, 0),
    COALESCE(p.quantidade, 0),
    COALESCE(p.metal_externo, 0),
    p.data_conclusao,
    COALESCE(p.date_created, now()),
    COALESCE(p.date_updated, p.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_created) THEN p.user_created ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_updated) THEN p.user_updated ELSE NULL END
FROM directus.pcp p
WHERE EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = p.ordem_id)
ON CONFLICT (id) DO NOTHING
""")
n_pcp = cur.rowcount
ok(f"Inseridas: {n_pcp} registros PCP")

# Resetar sequence
cur.execute("SELECT setval('alissonerp.pcp_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.pcp))")

cur.execute("ALTER TABLE alissonerp.pcp ENABLE TRIGGER trg_audit_pcp")

conn.commit()

# ── VALIDAÇÃO ────────────────────────────────────────────────────────────────
section("VALIDAÇÃO")
cur.execute("SELECT count(*) AS n FROM alissonerp.saidas_ordem")
n_saidas_depois = cur.fetchone()['n']
info(f"saidas_ordem: directus={n_saidas_dir}  alissonerp={n_saidas_depois}")
if n_saidas_depois >= n_saidas:
    ok(f"Saídas OK: {n_saidas_depois}")
else:
    fail(f"Saídas DIVERGE")

cur.execute("SELECT count(*) AS n FROM alissonerp.pcp")
n_pcp_depois = cur.fetchone()['n']
info(f"pcp: directus={n_pcp_dir}  alissonerp={n_pcp_depois}")
if n_pcp_depois == n_pcp_dir:
    ok(f"PCP BATE: {n_pcp_depois}")
else:
    fail(f"PCP DIVERGE: directus={n_pcp_dir} alissonerp={n_pcp_depois}")

# Distribuição etapas
cur.execute("SELECT etapas, count(*) AS n FROM alissonerp.pcp GROUP BY etapas ORDER BY n DESC")
info("Distribuição etapas:")
for r in cur.fetchall():
    print(f"    {str(r['etapas']):18s} = {r['n']}")

conn.close()
print("\n  \033[32mMigração 003 — PCP + Saídas concluída.\033[0m")
