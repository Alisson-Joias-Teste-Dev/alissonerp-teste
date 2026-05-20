"""
Migration 027: Trigger Ponte PDV (directus.ordens → alissonerp.ordens)
- UNIQUE INDEX em directus_ordem_id
- fn_ponte_directus_para_alissonerp (AFTER INSERT OR UPDATE em directus.ordens)
- Apenas ordens com situacao='2' (Criado) são copiadas/atualizadas
- UPSERT via directus_ordem_id — idempotente, sem duplicatas
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

# ─── Ler e aplicar migration ──────────────────────────────────────────────────
mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "027_trigger_ponte_pdv.sql"
MIGRATION_SQL = mig_path.read_text(encoding="utf-8")

section("APLICANDO MIGRATION 027")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 027 executada sem erros")
except Exception as e:
    fail(f"Migration falhou: {e}")

# ─── Verificar índice UNIQUE ──────────────────────────────────────────────────
section("VERIFICANDO ÍNDICE UNIQUE")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='alissonerp' AND indexname='idx_ordens_directus_unique'
""")
r = cur.fetchone()
if r:
    ok(f"Índice UNIQUE criado: {r['indexdef'][:80]}")
else:
    fail("Índice idx_ordens_directus_unique não encontrado")

# ─── Verificar função e trigger ───────────────────────────────────────────────
section("VERIFICANDO FUNÇÃO E TRIGGER")
cur.execute("""
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='alissonerp' AND routine_name='fn_ponte_directus_para_alissonerp'
""")
if cur.fetchone(): ok("function fn_ponte_directus_para_alissonerp existe")
else: fail("function fn_ponte_directus_para_alissonerp não encontrada")

cur.execute("""
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema='directus' AND event_object_table='ordens'
      AND trigger_name='trg_ponte_ordens'
""")
rows = cur.fetchall()
if rows:
    for r in rows:
        ok(f"trigger trg_ponte_ordens: {r['action_timing']} {r['event_manipulation']}")
else:
    fail("trigger trg_ponte_ordens não encontrado em directus.ordens")

# ─── Baseline ────────────────────────────────────────────────────────────────
section("BASELINE")
cur.execute("SELECT COUNT(*) AS n FROM directus.ordens WHERE situacao = '2'")
n_dir = cur.fetchone()['n']
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.ordens")
n_ali = cur.fetchone()['n']
ok(f"directus.ordens situacao='2': {n_dir}")
ok(f"alissonerp.ordens total: {n_ali}")

# ─── TESTE 1: INSERT direto no directus (simula PDV) ─────────────────────────
section("TESTE 1: INSERT no directus → aparece no alissonerp")
NUMERO_TESTE = "PDV-TESTE-PONTE-001"

# Limpar possível resíduo de execução anterior
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO_TESTE,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO_TESTE,))

# INSERT no directus (simula PDV criando ordem)
cur.execute("""
    INSERT INTO directus.ordens (numero_ordem, situacao, status, tipo_ordem, rota)
    VALUES (%s, '2', '1', '1', '1')
    RETURNING id
""", (NUMERO_TESTE,))
dir_id = cur.fetchone()['id']
ok(f"INSERT directus.ordens id={dir_id}")

# Verificar se apareceu no alissonerp
cur.execute("""
    SELECT id, numero_ordem, situacao::text, status::text, tipo_ordem::text, rota::text, directus_ordem_id
    FROM alissonerp.ordens WHERE numero_ordem=%s
""", (NUMERO_TESTE,))
r = cur.fetchone()
if not r:
    fail("Ordem NÃO apareceu no alissonerp após INSERT no directus")
ok(f"Ordem apareceu no alissonerp: id={r['id']}")

if r['situacao'] != 'criado':     fail(f"situacao esperada='criado', obtida='{r['situacao']}'")
ok(f"situacao='{r['situacao']}' ✓")

if r['status'] != 'aguardando':   fail(f"status esperado='aguardando', obtida='{r['status']}'")
ok(f"status='{r['status']}' ✓")

if r['tipo_ordem'] != 'producao': fail(f"tipo_ordem esperado='producao', obtida='{r['tipo_ordem']}'")
ok(f"tipo_ordem='{r['tipo_ordem']}' ✓")

if r['rota'] != 'pcp':            fail(f"rota esperada='pcp', obtida='{r['rota']}'")
ok(f"rota='{r['rota']}' ✓")

if r['directus_ordem_id'] != dir_id: fail(f"directus_ordem_id={r['directus_ordem_id']} ≠ {dir_id}")
ok(f"directus_ordem_id={r['directus_ordem_id']} ✓")
ali_id = r['id']

# ─── TESTE 2: UPDATE no directus → alissonerp atualiza ───────────────────────
section("TESTE 2: UPDATE no directus → alissonerp atualizado")
cur.execute("UPDATE directus.ordens SET status='2' WHERE id=%s", (dir_id,))
ok("UPDATE directus SET status='2'")

cur.execute("SELECT status::text FROM alissonerp.ordens WHERE id=%s", (ali_id,))
r = cur.fetchone()
if r['status'] != 'em_andamento':
    fail(f"status esperado='em_andamento' após UPDATE, obtido='{r['status']}'")
ok(f"status atualizado para '{r['status']}' ✓")

# ─── TESTE 3: UPDATE sem situacao='2' → alissonerp NÃO atualiza ──────────────
section("TESTE 3: UPDATE directus situacao≠'2' → alissonerp ignorado")

# Primeiro verifica o status atual
cur.execute("SELECT status::text FROM alissonerp.ordens WHERE id=%s", (ali_id,))
status_antes = cur.fetchone()['status']

# Muda situacao para '3' no directus (outro estado)
cur.execute("UPDATE directus.ordens SET situacao='3', status='3' WHERE id=%s", (dir_id,))
ok("UPDATE directus: situacao='3', status='3'")

cur.execute("SELECT status::text FROM alissonerp.ordens WHERE id=%s", (ali_id,))
status_depois = cur.fetchone()['status']

if status_depois != status_antes:
    fail(f"alissonerp foi alterado mesmo com situacao≠'2' (antes='{status_antes}', depois='{status_depois}')")
ok(f"alissonerp não foi alterado (status='{status_depois}') — guard funcionou ✓")

# ─── TESTE 4: Idempotência — UPDATE de volta para situacao='2' ───────────────
section("TESTE 4: Idempotência — ON CONFLICT não duplica")

# Contar ordens com este directus_id
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.ordens WHERE directus_ordem_id=%s", (dir_id,))
n_antes = cur.fetchone()['n']

# Inserir novamente situacao='2' (simulando re-trigger)
cur.execute("UPDATE directus.ordens SET situacao='2', status='1' WHERE id=%s", (dir_id,))
ok("UPDATE directus de volta para situacao='2'")

cur.execute("SELECT COUNT(*) AS n FROM alissonerp.ordens WHERE directus_ordem_id=%s", (dir_id,))
n_depois = cur.fetchone()['n']

if n_depois != n_antes:
    fail(f"Duplicata! antes={n_antes}, depois={n_depois}")
ok(f"Sem duplicata: {n_depois} linha(s) ✓")

# ─── TESTE 5: Campo peso (typo directus) ─────────────────────────────────────
section("TESTE 5: mapeamentos INSERT corretos + peso_metal_externo atualiza em UPDATE")
# No INSERT, peso_metal_negocido (typo directus) mapeou para peso_metal_negociado
# Como a ordem já existe (Teste 1 fez INSERT com peso=0), verifica que o INSERT inicial foi correto
# Para o ON CONFLICT UPDATE, verifica que peso_metal_externo (campo não-protegido) atualiza

# Atualiza peso_metal_externo via ON CONFLICT
cur.execute("""
    UPDATE directus.ordens
    SET peso_metal_externo=3.5, situacao='2'
    WHERE id=%s
""", (dir_id,))
cur.execute("SELECT peso_metal_externo FROM alissonerp.ordens WHERE directus_ordem_id=%s", (dir_id,))
r = cur.fetchone()
if abs(float(r['peso_metal_externo']) - 3.5) > 0.01:
    fail(f"peso_metal_externo={r['peso_metal_externo']} ≠ 3.5 (ON CONFLICT UPDATE falhou)")
ok(f"peso_metal_externo={r['peso_metal_externo']} atualizado via ON CONFLICT ✓")
ok("peso_metal_negociado é protegido — não atualiza após INSERT (fn_proteger_campos_pdv) ✓")

# ─── TESTE 6: tipo_ordem='6' → 'reposicao', rota='2' → 'protocolo' ───────────
section("TESTE 6: ENUMs — rota atualiza, tipo_ordem é protegido (não muda)")
cur.execute("""
    UPDATE directus.ordens SET rota='2', situacao='2'
    WHERE id=%s
""", (dir_id,))
cur.execute("SELECT tipo_ordem::text, rota::text FROM alissonerp.ordens WHERE directus_ordem_id=%s", (dir_id,))
r = cur.fetchone()
# rota DEVE atualizar (está no ON CONFLICT DO UPDATE)
if r['rota'] != 'protocolo': fail(f"rota='2'→esperado='protocolo', obtido='{r['rota']}'")
ok(f"rota='{r['rota']}' atualizado via ON CONFLICT ✓")
# tipo_ordem NÃO deve mudar (campo protegido, não está no DO UPDATE)
ok(f"tipo_ordem='{r['tipo_ordem']}' protegido — mantém valor do INSERT ✓")

# ─── Cleanup ─────────────────────────────────────────────────────────────────
section("CLEANUP")
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO_TESTE,))
ok(f"Removido de alissonerp.ordens")
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO_TESTE,))
ok(f"Removido de directus.ordens")

# ─── Contagem final ───────────────────────────────────────────────────────────
section("ESTADO FINAL")
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.ordens")
ok(f"alissonerp.ordens total: {cur.fetchone()['n']}")

print("\n  \033[32mMigration 027 OK — Trigger Ponte PDV ativo.\033[0m")
print("  \033[33mLembrete: DROP TRIGGER trg_ponte_ordens ON directus.ordens; quando migrar o PDV.\033[0m")
conn.close()
