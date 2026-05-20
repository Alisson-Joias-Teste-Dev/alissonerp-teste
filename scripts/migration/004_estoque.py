"""
Migração 004: Movimentações de Estoque
directus.controle_estoque → alissonerp.movimentacoes_estoque

Notas:
- directus.controle_estoque.setor    → alissonerp.movimentacoes_estoque.setor_id
- marcador 'E' (1 linha) → mapeado para 'ENTRADA'
- deposito_id 9-12 não existem em alissonerp → NULL
- ordem_id pode não existir → NULL quando ausente
- created_by: NULL quando UUID não existe em auth.users
- IDs directus: 533-2316, sem conflito com teste (5-18)
Idempotente via ON CONFLICT (id) DO NOTHING.
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
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}"); conn.rollback(); sys.exit(1)
def info(msg): print(f"  \033[34mINFO\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("PRÉ-CONDIÇÕES")
cur.execute("SELECT count(*) AS n FROM directus.controle_estoque")
n_dir = cur.fetchone()['n']
info(f"directus.controle_estoque: {n_dir}")
cur.execute("SELECT count(*) AS n FROM alissonerp.movimentacoes_estoque")
info(f"alissonerp.movimentacoes_estoque antes: {cur.fetchone()['n']}")

# Checar marcadores não cobertos pelo enum (além de 'E')
cur.execute("""
    SELECT DISTINCT c.marcador
    FROM directus.controle_estoque c
    WHERE c.marcador IS NOT NULL
      AND c.marcador NOT IN (
          SELECT enumlabel::text FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'enum_marcador_estoque'
      )
      AND c.marcador <> 'E'
""")
unknowns = [r['marcador'] for r in cur.fetchall()]
if unknowns:
    info(f"Marcadores desconhecidos (serão NULL): {unknowns}")
else:
    info("Todos os marcadores cobertos pelo enum (exceto 'E'→'ENTRADA')")

# ── MIGRAR MOVIMENTAÇÕES ──────────────────────────────────────────────────────
section("MIGRANDO MOVIMENTAÇÕES DE ESTOQUE")
cur.execute("ALTER TABLE alissonerp.movimentacoes_estoque DISABLE TRIGGER trg_audit_mov_estoque")

cur.execute("""
INSERT INTO alissonerp.movimentacoes_estoque (
    id,
    entrada, saida,
    insumo_id, deposito_id, setor_id, ordem_id,
    marcador,
    obs, data_hora,
    valor_total, preco_compra,
    created_at, created_by
)
SELECT
    c.id,
    COALESCE(c.entrada, 0),
    COALESCE(c.saida, 0),
    c.insumo_id,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.depositos d WHERE d.id = c.deposito_id) THEN c.deposito_id ELSE NULL END,
    c.setor,  -- mesmo valor int, col renomeada setor → setor_id
    CASE WHEN c.ordem_id IS NULL THEN NULL
         WHEN EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = c.ordem_id) THEN c.ordem_id
         ELSE NULL END,
    CASE c.marcador
        WHEN 'E'  THEN 'ENTRADA'::alissonerp.enum_marcador_estoque
        WHEN NULL THEN NULL
        ELSE
            CASE WHEN c.marcador IN (
                'AD','EM','EP','RM','RP','BI','SM','SP','SOI','TED','ADD',
                'EIMD','EPD','RPD','RMD','EOID','SOID','TEDMD','TEDPD','TEDD',
                'TA','EA','SA','Sangria','ENTRADA'
            ) THEN c.marcador::alissonerp.enum_marcador_estoque
            ELSE NULL END
    END,
    c.obs,
    COALESCE(c.data_hora, c.date_created, now()),
    COALESCE(c.valor_total, 0),
    COALESCE(c.preco_compra, 0),
    COALESCE(c.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_created) THEN c.user_created ELSE NULL END
FROM directus.controle_estoque c
ON CONFLICT (id) DO NOTHING
""")
n_ins = cur.rowcount
ok(f"Inseridas: {n_ins} movimentações")

# Resetar sequence
cur.execute("SELECT setval('alissonerp.movimentacoes_estoque_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.movimentacoes_estoque))")

cur.execute("ALTER TABLE alissonerp.movimentacoes_estoque ENABLE TRIGGER trg_audit_mov_estoque")

conn.commit()

# ── VALIDAÇÃO ─────────────────────────────────────────────────────────────────
section("VALIDAÇÃO")
cur.execute("SELECT count(*) AS n FROM alissonerp.movimentacoes_estoque")
n_depois = cur.fetchone()['n']
info(f"directus: {n_dir}   alissonerp: {n_depois}")
if n_depois >= n_dir:
    ok(f"Contagem OK: {n_depois} (inclui {n_depois - n_ins} linhas de teste preexistentes)")
else:
    fail(f"DIVERGE: directus={n_dir} alissonerp={n_depois}")

# Distribuição por marcador
cur.execute("""
    SELECT marcador, count(*) AS n FROM alissonerp.movimentacoes_estoque
    WHERE id >= 533  -- apenas linhas migradas do directus
    GROUP BY marcador ORDER BY n DESC LIMIT 10
""")
info("Top marcadores (linhas directus):")
for r in cur.fetchall():
    print(f"    {str(r['marcador'] or 'NULL'):12s} = {r['n']}")

conn.close()
print("\n  \033[32mMigração 004 — Movimentações de Estoque concluída.\033[0m")
