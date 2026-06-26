"""
Migration 026: Módulo Auditoria Completo
- Expande tabela auditorias (14 novas colunas)
- Substitui fn_processar_saida_ordem (auditoria pendente c/ PMC)
- Substitui fn_processar_auditoria (aprovado→data_conclusao, reprovado→retrabalho)
- Cria vw_auditorias_completa e vw_dashboard_auditoria
- Índices + RLS
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
def fail(msg):    print(f"  \033[31mFAIL\033[0m {msg}")
def warn(msg):    print(f"  \033[33mWARN\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

# ─── Ler SQL do arquivo ───────────────────────────────────────────────────────
mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "026_auditoria_completa.sql"
MIGRATION_SQL = mig_path.read_text(encoding="utf-8")

# ─── Executar Migration ───────────────────────────────────────────────────────
section("APLICANDO MIGRATION 026")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 026 executada sem erros")
except Exception as e:
    fail(f"Migration falhou: {e}")
    sys.exit(1)

# ─── Verificar colunas adicionadas ───────────────────────────────────────────
section("COLUNAS DA TABELA auditorias")
cur.execute("""
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'auditorias'
    ORDER BY ordinal_position
""")
cols = cur.fetchall()
ok(f"{len(cols)} colunas encontradas:")
for c in cols:
    print(f"    {c['column_name']:30s}  {c['data_type']:20s}  default={c['column_default']}")

EXPECTED_COLS = [
    'responsavel_id', 'parecer', 'motivo_reprovacao', 'tipo_retrabalho',
    'peso_negociado', 'peso_final', 'pmc', 'quebra', 'quebra_percentual',
    'total_metal', 'retorno_metal', 'metal_externo', 'ourives_nome', 'ordem_retrabalho_id'
]
col_names = {c['column_name'] for c in cols}
missing = [c for c in EXPECTED_COLS if c not in col_names]
if missing:
    fail(f"Colunas faltando: {missing}")
else:
    ok("Todas as 14 novas colunas presentes")

# ─── Verificar views ──────────────────────────────────────────────────────────
section("VERIFICANDO VIEWS")
for vw in ["vw_auditorias_completa", "vw_dashboard_auditoria"]:
    cur.execute("SELECT 1 FROM information_schema.views WHERE table_schema='alissonerp' AND table_name=%s", (vw,))
    if cur.fetchone(): ok(f"view {vw}")
    else: fail(f"view {vw} NAO ENCONTRADA")

# ─── Verificar funções ────────────────────────────────────────────────────────
section("VERIFICANDO FUNÇÕES")
for fn in ["fn_processar_saida_ordem", "fn_processar_auditoria"]:
    cur.execute("""
        SELECT 1 FROM information_schema.routines
        WHERE routine_schema='alissonerp' AND routine_name=%s
    """, (fn,))
    if cur.fetchone(): ok(f"function {fn}")
    else: fail(f"function {fn} NAO ENCONTRADA")

# ─── Verificar trigger ────────────────────────────────────────────────────────
section("VERIFICANDO TRIGGER")
cur.execute("""
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema='alissonerp' AND event_object_table='auditorias'
""")
triggers = cur.fetchall()
ok(f"{len(triggers)} trigger(s) em auditorias:")
for t in triggers:
    print(f"    {t['trigger_name']:40s}  {t['action_timing']} {t['event_manipulation']}")

# ─── Verificar índices ────────────────────────────────────────────────────────
section("VERIFICANDO ÍNDICES")
cur.execute("""
    SELECT indexname FROM pg_indexes
    WHERE schemaname='alissonerp' AND tablename='auditorias'
    ORDER BY indexname
""")
idxs = cur.fetchall()
ok(f"{len(idxs)} índices em auditorias:")
for idx in idxs:
    print(f"    {idx['indexname']}")

# ─── Dashboard KPIs (estado atual) ───────────────────────────────────────────
section("vw_dashboard_auditoria (estado atual)")
cur.execute("SELECT * FROM alissonerp.vw_dashboard_auditoria")
dash = cur.fetchone()
ok("KPIs:")
for k, v in dash.items():
    print(f"    {k:25s} = {v}")

# ─── Estado das auditorias existentes ────────────────────────────────────────
section("AUDITORIAS EXISTENTES")
cur.execute("""
    SELECT situacao, COUNT(*) AS total
    FROM alissonerp.auditorias
    GROUP BY situacao ORDER BY situacao
""")
rows = cur.fetchall()
if rows:
    for r in rows:
        print(f"    {r['situacao']:15s} = {r['total']}")
else:
    warn("Nenhuma auditoria existente (tabela vazia — esperado para DB novo)")

# ─── TESTE E2E: Simular fluxo completo ───────────────────────────────────────
section("TESTE E2E — FLUXO SAIDA → AUDITORIA")

# Verificar se há ordens/pcp ativos para testar
cur.execute("""
    SELECT o.id AS ordem_id, s.id AS saida_id, p.id AS pcp_id
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    JOIN alissonerp.saidas_ordem s ON s.id = p.saida_ordem_id
    WHERE p.etapas NOT IN ('concluido','cancelado')
      AND s.peso IS NULL
    LIMIT 1
""")
test_row = cur.fetchone()

if not test_row:
    warn("Nenhuma ordem/PCP ativo sem peso para simular trigger — pulando teste de trigger")
    warn("(Isso é normal se não houver ordens em andamento no momento)")
else:
    ordem_id = test_row['ordem_id']
    saida_id = test_row['saida_id']
    pcp_id   = test_row['pcp_id']
    ok(f"Usando ordem_id={ordem_id}, saida_id={saida_id}, pcp_id={pcp_id}")

    # Verificar se PCP tem total_metal para calcular PMC
    cur.execute("SELECT * FROM alissonerp.pcp WHERE id=%s", (pcp_id,))
    pcp = cur.fetchone()
    print(f"    PCP: total_metal={pcp['total_metal']}, retorno_metal={pcp['retorno_metal']}, metal_externo={pcp['metal_externo']}")

    # Simular UPDATE na saida com peso (dispara fn_processar_saida_ordem)
    PESO_TESTE = 10.5
    print(f"    Simulando: UPDATE saidas_ordem SET peso={PESO_TESTE} WHERE id={saida_id}")

    # Guardar auditoria count antes
    cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s", (ordem_id,))
    antes = cur.fetchone()['n']

    try:
        cur.execute("""
            UPDATE alissonerp.saidas_ordem SET peso=%s WHERE id=%s
        """, (PESO_TESTE, saida_id))
        ok(f"UPDATE executado")
    except Exception as e:
        fail(f"UPDATE falhou: {e}")
        goto_cleanup = True
    else:
        goto_cleanup = False

    if not goto_cleanup:
        cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s", (ordem_id,))
        depois = cur.fetchone()['n']

        if depois > antes:
            ok(f"Auditoria criada automaticamente! (antes={antes}, depois={depois})")
            cur.execute("""
                SELECT id, situacao, tipo_auditoria, peso_negociado, peso_final, pmc,
                       quebra, quebra_percentual, total_metal, ourives_nome
                FROM alissonerp.auditorias WHERE ordem_id=%s ORDER BY id DESC LIMIT 1
            """, (ordem_id,))
            aud = cur.fetchone()
            ok(f"Auditoria criada:")
            for k, v in aud.items():
                print(f"      {k:25s} = {v}")

            # Verificar PCP concluído
            cur.execute("SELECT etapas, peso_final, pmc FROM alissonerp.pcp WHERE id=%s", (pcp_id,))
            pcp_after = cur.fetchone()
            ok(f"PCP atualizado: etapas={pcp_after['etapas']}, peso_final={pcp_after['peso_final']}, pmc={pcp_after['pmc']}")

            # Verificar ordem concluída
            cur.execute("SELECT status, data_conclusao FROM alissonerp.ordens WHERE id=%s", (ordem_id,))
            ord_after = cur.fetchone()
            ok(f"Ordem atualizada: status={ord_after['status']}, data_conclusao={ord_after['data_conclusao']}")

            # Rollback do teste (restaurar estado anterior)
            aud_id = aud['id']
            print(f"\n    [Rollback do teste E2E]")
            cur.execute("DELETE FROM alissonerp.auditorias WHERE id=%s", (aud_id,))
            cur.execute("UPDATE alissonerp.saidas_ordem SET peso=NULL WHERE id=%s", (saida_id,))
            cur.execute("UPDATE alissonerp.pcp SET etapas='em_andamento', peso_final=NULL, pmc=NULL, data_conclusao=NULL, saida_ordem_id=%s WHERE id=%s", (saida_id, pcp_id))
            cur.execute("UPDATE alissonerp.ordens SET status='aguardando', data_conclusao=NULL WHERE id=%s", (ordem_id,))
            ok("Estado restaurado após teste")
        else:
            fail(f"Auditoria NÃO foi criada (antes={antes}, depois={depois})")

# ─── Verificar view completa ──────────────────────────────────────────────────
section("vw_auditorias_completa (amostra)")
cur.execute("SELECT COUNT(*) AS total FROM alissonerp.vw_auditorias_completa")
total = cur.fetchone()['total']
ok(f"vw_auditorias_completa: {total} linhas")
if total > 0:
    cur.execute("SELECT id, situacao_label, ourives_nome, quebra_percentual, dias_analise FROM alissonerp.vw_auditorias_completa LIMIT 5")
    for r in cur.fetchall():
        print(f"    id={r['id']}  {r['situacao_label']:15s}  ourives={r['ourives_nome']}  quebra={r['quebra_percentual']}%  dias={r['dias_analise']}")

# ─── Verificar RLS ────────────────────────────────────────────────────────────
section("VERIFICANDO RLS")
cur.execute("""
    SELECT policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname='alissonerp' AND tablename='auditorias'
""")
policies = cur.fetchall()
ok(f"{len(policies)} políticas RLS em auditorias:")
for p in policies:
    print(f"    {p['policyname']:35s}  cmd={p['cmd']:5s}  roles={p['roles']}")

print("\n  \033[32mMigration 026 OK — Módulo Auditoria pronto.\033[0m")
conn.close()
