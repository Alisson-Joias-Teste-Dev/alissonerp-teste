"""
Migration 028: Auditoria Dupla (Loja + Fábrica)
- Colunas novas em auditorias (ficha_tecnica_obs, dados_ordem)
- Migração tipo existente → 'fabrica'
- UNIQUE INDEX (ordem_id, tipo_auditoria)
- fn_ponte_directus_para_alissonerp: cria auditoria loja no INSERT
- fn_processar_saida_ordem: tipo='fabrica'
- fn_processar_auditoria: loja vs fábrica (approve/reject diferentes)
- Views atualizadas + novas (prontas_ida, prontas_pcp, aguardando_loja)
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

# ─── Aplicar migration ────────────────────────────────────────────────────────
mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "028_auditoria_dupla.sql"
MIGRATION_SQL = mig_path.read_text(encoding="utf-8")

section("APLICANDO MIGRATION 028")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 028 executada sem erros")
except Exception as e:
    fail(f"Migration falhou: {e}")

# ─── Verificações estruturais ─────────────────────────────────────────────────
section("COLUNAS NOVAS")
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='auditorias'
    AND column_name IN ('ficha_tecnica_obs','dados_ordem')
""")
cols = {r['column_name'] for r in cur.fetchall()}
for c in ['ficha_tecnica_obs', 'dados_ordem']:
    if c in cols: ok(f"coluna {c} existe")
    else: fail(f"coluna {c} não encontrada")

section("ÍNDICE UNIQUE (ordem_id, tipo_auditoria)")
cur.execute("SELECT indexname FROM pg_indexes WHERE schemaname='alissonerp' AND indexname='idx_auditoria_ordem_tipo'")
if cur.fetchone(): ok("idx_auditoria_ordem_tipo criado")
else: fail("idx_auditoria_ordem_tipo não encontrado")

section("TIPO AUDITORIA MIGRADO")
cur.execute("SELECT tipo_auditoria, COUNT(*) AS n FROM alissonerp.auditorias GROUP BY tipo_auditoria")
rows = cur.fetchall()
for r in rows: print(f"  tipo='{r['tipo_auditoria']}'  n={r['n']}")
old_tipos = {r['tipo_auditoria'] for r in rows if r['tipo_auditoria'] in ('alerta','producao')}
if old_tipos:
    fail(f"Ainda existem tipos antigos: {old_tipos}")
ok("Tipos antigos (alerta/producao) migrados para 'fabrica'")

section("VIEWS")
for vw in ['vw_auditorias_completa', 'vw_dashboard_auditoria', 'vw_ordens_prontas_volta',
           'vw_ordens_prontas_ida', 'vw_ordens_prontas_pcp', 'vw_ordens_aguardando_auditoria_loja']:
    cur.execute("SELECT 1 FROM information_schema.views WHERE table_schema='alissonerp' AND table_name=%s", (vw,))
    if cur.fetchone(): ok(f"view {vw}")
    else: fail(f"view {vw} não encontrada")

# ─── TESTE 1: INSERT directus → ordem alissonerp + auditoria LOJA ─────────────
section("TESTE 1: INSERT directus → auditoria LOJA criada automaticamente")
NUMERO = "PDV-TESTE-AUDIT-028"

cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem=%s)", (NUMERO,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO,))

cur.execute("""
    INSERT INTO directus.ordens (numero_ordem, situacao, status, tipo_ordem, rota, peso_metal_negocido)
    VALUES (%s, '2', '1', '1', '2', 15.0)
    RETURNING id
""", (NUMERO,))
dir_id = cur.fetchone()['id']
ok(f"INSERT directus id={dir_id}")

cur.execute("SELECT id, situacao::text, rota::text FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if not r: fail("Ordem não copiada para alissonerp")
ali_id = r['id']
ok(f"Ordem copiada: id={ali_id}, situacao={r['situacao']}, rota={r['rota']}")

cur.execute("""
    SELECT id, tipo_auditoria, situacao, peso_negociado, dados_ordem
    FROM alissonerp.auditorias WHERE ordem_id=%s
""", (ali_id,))
aud = cur.fetchone()
if not aud: fail("Auditoria LOJA não criada!")
if aud['tipo_auditoria'] != 'loja': fail(f"tipo_auditoria={aud['tipo_auditoria']} ≠ 'loja'")
if aud['situacao'] != 'pendente':   fail(f"situacao={aud['situacao']} ≠ 'pendente'")
ok(f"Auditoria LOJA criada: id={aud['id']}, tipo={aud['tipo_auditoria']}, situacao={aud['situacao']}")
ok(f"peso_negociado={aud['peso_negociado']}, dados_ordem={str(aud['dados_ordem'])[:60]}")
AUD_LOJA_ID = aud['id']

# ─── TESTE 2: Ordem bloqueada (NÃO aparece em prontas_ida) ────────────────────
section("TESTE 2: Ordem bloqueada — NÃO aparece em vw_ordens_prontas_ida")
cur.execute("SELECT id FROM alissonerp.vw_ordens_prontas_ida WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if r: fail(f"Ordem apareceu em vw_ordens_prontas_ida ANTES de aprovação! id={r['id']}")
ok("Ordem bloqueada — NÃO aparece em vw_ordens_prontas_ida ✓")

# Também deve aparecer em aguardando_auditoria_loja
cur.execute("SELECT auditoria_situacao FROM alissonerp.vw_ordens_aguardando_auditoria_loja WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if not r: fail("Ordem não aparece em vw_ordens_aguardando_auditoria_loja")
ok(f"Aparece em vw_ordens_aguardando_auditoria_loja: auditoria_situacao='{r['auditoria_situacao']}' ✓")

# ─── TESTE 3: Aprovar auditoria LOJA → ordem liberada ─────────────────────────
section("TESTE 3: Aprovar auditoria LOJA → ordem aparece em vw_ordens_prontas_ida")
cur.execute("UPDATE alissonerp.auditorias SET situacao='aprovado', parecer='Dados OK' WHERE id=%s", (AUD_LOJA_ID,))
ok("Auditoria LOJA aprovada")

cur.execute("SELECT id FROM alissonerp.vw_ordens_prontas_ida WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if not r: fail("Ordem NÃO apareceu em vw_ordens_prontas_ida após aprovação loja!")
ok(f"Ordem liberada — aparece em vw_ordens_prontas_ida ✓")

cur.execute("SELECT auditoria_situacao FROM alissonerp.vw_ordens_aguardando_auditoria_loja WHERE numero_ordem=%s", (NUMERO,))
r = cur.fetchone()
if r: fail(f"Ordem ainda aparece em aguardando_auditoria_loja após aprovação!")
ok("Ordem saiu de vw_ordens_aguardando_auditoria_loja ✓")

# ─── TESTE 4: UPDATE directus NÃO duplica auditoria ─────────────────────────
section("TESTE 4: UPDATE directus NÃO duplica auditoria loja")
cur.execute("UPDATE directus.ordens SET peso_metal_negocido=16.0, situacao='2' WHERE id=%s", (dir_id,))
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s AND tipo_auditoria='loja'", (ali_id,))
n = cur.fetchone()['n']
if n != 1: fail(f"Duplicata! {n} auditorias loja para a mesma ordem")
ok(f"Sem duplicata: {n} auditoria loja ✓")

# ─── TESTE 5: vw_dashboard_auditoria agrupado por tipo ───────────────────────
section("TESTE 5: vw_dashboard_auditoria por tipo")
cur.execute("SELECT tipo_auditoria, pendentes, aprovadas, total FROM alissonerp.vw_dashboard_auditoria ORDER BY tipo_auditoria")
rows = cur.fetchall()
ok(f"Dashboard por tipo ({len(rows)} tipos):")
for r in rows:
    print(f"  tipo='{r['tipo_auditoria']}' pendentes={r['pendentes']} aprovadas={r['aprovadas']} total={r['total']}")

# ─── TESTE 6: Reprovar auditoria LOJA → ordem vira rascunho ──────────────────
section("TESTE 6: Reprovar auditoria LOJA → ordem vira rascunho")
# Usa uma NOVA ordem para ter uma auditoria loja 'pendente' fresca
NUMERO2 = "PDV-TESTE-AUDIT-028-REJ"
cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem=%s)", (NUMERO2,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO2,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO2,))

cur.execute("""
    INSERT INTO directus.ordens (numero_ordem, situacao, status, tipo_ordem, rota, peso_metal_negocido)
    VALUES (%s, '2', '1', '1', '1', 12.0)
    RETURNING id
""", (NUMERO2,))
dir2_id = cur.fetchone()['id']

cur.execute("SELECT id FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO2,))
ali2_id = cur.fetchone()['id']
ok(f"Nova ordem de teste criada: id={ali2_id}")

cur.execute("SELECT id FROM alissonerp.auditorias WHERE ordem_id=%s AND tipo_auditoria='loja'", (ali2_id,))
aud2 = cur.fetchone()
if not aud2: fail("Auditoria LOJA não criada para ordem 2")
AUD_LOJA2_ID = aud2['id']
ok(f"Auditoria loja pendente id={AUD_LOJA2_ID}")

# Reprovar sem motivo → deve lançar exception
try:
    cur.execute("UPDATE alissonerp.auditorias SET situacao='reprovado' WHERE id=%s", (AUD_LOJA2_ID,))
    fail("Esperava exception 'Motivo obrigatório' mas não veio")
except psycopg2.errors.RaiseException:
    ok("Exception 'Motivo de reprovação é obrigatório' ✓")

cur.execute("UPDATE alissonerp.auditorias SET situacao='reprovado', motivo_reprovacao='Peso incorreto' WHERE id=%s", (AUD_LOJA2_ID,))
ok("Auditoria LOJA reprovada com motivo")

cur.execute("SELECT situacao::text, origem_reprovacao FROM alissonerp.ordens WHERE id=%s", (ali2_id,))
r = cur.fetchone()
if r['situacao'] != 'rascunho': fail(f"Ordem situacao={r['situacao']} ≠ 'rascunho'")
ok(f"Ordem situacao='{r['situacao']}', origem_reprovacao='{r['origem_reprovacao']}' ✓")

# Índice parcial: nova auditoria loja deve ser permitida após reprovação
cur.execute("SELECT id FROM alissonerp.auditorias WHERE ordem_id=%s AND tipo_auditoria='loja' AND situacao='reprovado'", (ali2_id,))
if not cur.fetchone(): fail("Auditoria reprovada não encontrada")
# Criar nova auditoria loja ativa (simula PDV re-enviando ordem)
cur.execute("""
    INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, peso_negociado)
    VALUES ('pendente', 'loja', 'entrada_ordem', %s, 12.0)
    RETURNING id
""", (ali2_id,))
new_aud_id = cur.fetchone()['id']
ok(f"Nova auditoria loja após reprovação criada id={new_aud_id} ✓ (índice parcial funcionou)")

# ─── TESTE 7: Saída PCP → auditoria FÁBRICA ───────────────────────────────────
section("TESTE 7: saída ordem INSERT → auditoria FÁBRICA com tipo='fabrica'")
# Buscar PCP ativo com total_metal > 0
cur.execute("""
    SELECT p.id AS pcp_id, p.ordem_id, p.saida_ordem_id AS saida_id, p.total_metal
    FROM alissonerp.pcp p
    WHERE p.etapas NOT IN ('concluido','cancelado')
      AND p.total_metal > 0
    LIMIT 1
""")
pcp_row = cur.fetchone()
if not pcp_row:
    warn("Nenhum PCP ativo com total_metal>0 para testar trigger saída")
else:
    PCP_ID   = pcp_row['pcp_id']
    ORDEM_ID = pcp_row['ordem_id']
    PESO     = max(float(pcp_row['total_metal']) * 0.9, 1.0)

    cur.execute("SELECT * FROM alissonerp.pcp WHERE id=%s", (PCP_ID,))
    pcp_orig = dict(cur.fetchone())
    cur.execute("SELECT * FROM alissonerp.ordens WHERE id=%s", (ORDEM_ID,))
    ord_orig = dict(cur.fetchone())

    cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s", (ORDEM_ID,))
    antes = cur.fetchone()['n']

    cur.execute("INSERT INTO alissonerp.saidas_ordem (ordem_id, peso) VALUES (%s, %s) RETURNING id", (ORDEM_ID, PESO))
    new_saida_id = cur.fetchone()['id']
    ok(f"INSERT saidas_ordem id={new_saida_id}")

    cur.execute("SELECT tipo_auditoria, situacao FROM alissonerp.auditorias WHERE ordem_id=%s AND tipo_auditoria='fabrica' ORDER BY id DESC LIMIT 1", (ORDEM_ID,))
    fab_aud = cur.fetchone()
    if not fab_aud: fail("Auditoria FÁBRICA não criada!")
    if fab_aud['tipo_auditoria'] != 'fabrica': fail(f"tipo={fab_aud['tipo_auditoria']} ≠ 'fabrica'")
    ok(f"Auditoria FÁBRICA criada: tipo='{fab_aud['tipo_auditoria']}', situacao='{fab_aud['situacao']}' ✓")

    # Rollback
    cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id=%s AND tipo_auditoria='fabrica' AND situacao='pendente'", (ORDEM_ID,))
    cur.execute("DELETE FROM alissonerp.saidas_ordem WHERE id=%s", (new_saida_id,))
    cur.execute("UPDATE alissonerp.pcp SET etapas=%s, peso_final=%s, pmc=%s, quebra=%s, porcentagem_de_quebra=%s, data_conclusao=%s, saida_ordem_id=%s WHERE id=%s",
                (pcp_orig['etapas'], pcp_orig['peso_final'], pcp_orig['pmc'], pcp_orig['quebra'], pcp_orig['porcentagem_de_quebra'], pcp_orig['data_conclusao'], pcp_orig['saida_ordem_id'], PCP_ID))
    cur.execute("UPDATE alissonerp.ordens SET status=%s, data_conclusao=%s WHERE id=%s",
                (str(ord_orig['status']), ord_orig['data_conclusao'], ORDEM_ID))
    ok("Rollback executado")

# ─── Cleanup ──────────────────────────────────────────────────────────────────
section("CLEANUP")
cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id=%s", (ali_id,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO,))
cur.execute("DELETE FROM alissonerp.auditorias WHERE ordem_id=%s", (ali2_id,))
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem=%s", (NUMERO2,))
cur.execute("DELETE FROM directus.ordens WHERE numero_ordem=%s", (NUMERO2,))
ok(f"Dados de teste removidos")

section("ESTADO FINAL")
cur.execute("SELECT tipo_auditoria, COUNT(*) AS n FROM alissonerp.auditorias GROUP BY tipo_auditoria ORDER BY tipo_auditoria")
rows = cur.fetchall()
if not rows:
    ok("Tabela auditorias vazia (esperado se todos os testes E2E foram limpos)")
for r in rows:
    print(f"  tipo='{r['tipo_auditoria']}' n={r['n']}")

print("\n  \033[32mMigration 028 OK — Auditoria Dupla ativa.\033[0m")
conn.close()
