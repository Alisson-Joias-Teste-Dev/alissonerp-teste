"""
Teste E2E completo do módulo Auditoria (Migration 026)
Fluxos:
  1. Saida ordem → auditoria criada automaticamente (pendente)
  2. Auditoria aprovada → data_conclusao setada
  3. Auditoria reprovada → ordem retrabalho criada
  4. Auditoria reprovada sem motivo → erro esperado
  5. vw_ordens_prontas_volta — lista corretas
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)

def ok(msg):      print(f"  \033[32m✓\033[0m  {msg}")
def fail(msg):    print(f"  \033[31m✗\033[0m  {msg}"); sys.exit(1)
def warn(msg):    print(f"  \033[33m!\033[0m  {msg}")
def section(msg): print(f"\n\033[1m{'─'*50}\033[0m\n  {msg}\n\033[1m{'─'*50}\033[0m")

# ─── Setup: encontrar PCP ativo ───────────────────────────────────────────────
section("Setup: buscando PCP ativo com total_metal > 0")

cur.execute("""
    SELECT p.id AS pcp_id, p.ordem_id, p.saida_ordem_id AS saida_id,
           p.total_metal, p.retorno_metal, p.metal_externo,
           o.peso_metal_negociado
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.etapas = 'em_andamento'
      AND p.total_metal > 0
    LIMIT 1
""")
row = cur.fetchone()
if not row:
    warn("Nenhum PCP em andamento com total_metal > 0. Usando PCP qualquer...")
    cur.execute("""
        SELECT p.id AS pcp_id, p.ordem_id, p.saida_ordem_id AS saida_id,
               p.total_metal, p.retorno_metal, p.metal_externo,
               o.peso_metal_negociado
        FROM alissonerp.pcp p
        JOIN alissonerp.ordens o ON o.id = p.ordem_id
        WHERE p.etapas NOT IN ('concluido','cancelado')
        LIMIT 1
    """)
    row = cur.fetchone()

if not row:
    fail("Sem PCPs ativos para testar. Crie uma ordem no sistema primeiro.")

PCP_ID   = row['pcp_id']
ORDEM_ID = row['ordem_id']
SAIDA_ID = row['saida_id']
PESO     = max(float(row['total_metal'] or 0) * 0.9, 1.0)  # 90% do total_metal

ok(f"PCP_ID={PCP_ID}, ORDEM_ID={ORDEM_ID}, SAIDA_ID={SAIDA_ID}")
ok(f"total_metal={row['total_metal']}, peso_teste={PESO:.2f}")

# Salvar estado original do PCP e Ordem
cur.execute("SELECT * FROM alissonerp.pcp WHERE id=%s", (PCP_ID,))
pcp_original = dict(cur.fetchone())
cur.execute("SELECT * FROM alissonerp.ordens WHERE id=%s", (ORDEM_ID,))
ord_original = dict(cur.fetchone())

# ─── TESTE 1: Saida → Auditoria automática ────────────────────────────────────
section("Teste 1: INSERT saida com peso → auditoria auto-criada")

cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s", (ORDEM_ID,))
antes = cur.fetchone()['n']

cur.execute("""
    INSERT INTO alissonerp.saidas_ordem (ordem_id, peso)
    VALUES (%s, %s)
    RETURNING id
""", (ORDEM_ID, PESO))
NEW_SAIDA_ID = cur.fetchone()['id']
ok(f"INSERT saidas_ordem id={NEW_SAIDA_ID}")

cur.execute("SELECT COUNT(*) AS n FROM alissonerp.auditorias WHERE ordem_id=%s", (ORDEM_ID,))
depois = cur.fetchone()['n']

if depois <= antes:
    fail("Auditoria NÃO foi criada pelo trigger")

cur.execute("SELECT * FROM alissonerp.auditorias WHERE ordem_id=%s ORDER BY id DESC LIMIT 1", (ORDEM_ID,))
AUD = dict(cur.fetchone())
AUD_ID = AUD['id']

if AUD['situacao'] != 'pendente':
    fail(f"situacao esperada='pendente', obtida='{AUD['situacao']}'")
ok(f"Auditoria #{AUD_ID} criada com situacao='{AUD['situacao']}'")

if abs(float(AUD['peso_final']) - PESO) > 0.01:
    fail(f"peso_final esperado={PESO:.3f}, obtido={AUD['peso_final']:.3f}")
ok(f"peso_final={AUD['peso_final']} ✓")

if AUD['pmc'] is None:
    fail("pmc não calculado")
ok(f"pmc={AUD['pmc']:.4f}, quebra={AUD['quebra']:.4f}, quebra_pct={AUD['quebra_percentual']:.2f}%")

tipo_esperado = 'alerta' if AUD['quebra_percentual'] > 5 else 'producao'
if AUD['tipo_auditoria'] != tipo_esperado:
    fail(f"tipo_auditoria esperado='{tipo_esperado}', obtido='{AUD['tipo_auditoria']}'")
ok(f"tipo_auditoria='{AUD['tipo_auditoria']}' ✓")

# Verificar PCP concluído
cur.execute("SELECT etapas, peso_final, pmc FROM alissonerp.pcp WHERE id=%s", (PCP_ID,))
pcp_after = cur.fetchone()
if pcp_after['etapas'] != 'concluido':
    fail(f"PCP etapas esperada='concluido', obtida='{pcp_after['etapas']}'")
ok(f"PCP etapas='{pcp_after['etapas']}', pmc={pcp_after['pmc']:.4f} ✓")

# Verificar Ordem concluída
cur.execute("SELECT status FROM alissonerp.ordens WHERE id=%s", (ORDEM_ID,))
ord_after = cur.fetchone()
if str(ord_after['status']) != 'concluido':
    fail(f"Ordem status esperado='concluido', obtido='{ord_after['status']}'")
ok(f"Ordem status='{ord_after['status']}' ✓")

# ─── TESTE 2: Reprovar sem motivo → erro ──────────────────────────────────────
section("Teste 2: Reprovar sem motivo → RAISE EXCEPTION esperado")
try:
    cur.execute("""
        UPDATE alissonerp.auditorias
        SET situacao = 'reprovado'
        WHERE id = %s
    """, (AUD_ID,))
    fail("Esperava exception 'Motivo de reprovação é obrigatório' mas não veio")
except psycopg2.errors.RaiseException as e:
    ok(f"Exception correta: {str(e).strip()[:80]}")

# ─── TESTE 3: Aprovar → data_conclusao ────────────────────────────────────────
section("Teste 3: Aprovar auditoria → data_conclusao setada")

cur.execute("""
    UPDATE alissonerp.auditorias
    SET situacao = 'aprovado', parecer = 'Peça dentro do padrão de qualidade.'
    WHERE id = %s
""", (AUD_ID,))

cur.execute("SELECT situacao, data_conclusao, parecer FROM alissonerp.auditorias WHERE id=%s", (AUD_ID,))
aud_ap = cur.fetchone()
if aud_ap['situacao'] != 'aprovado':
    fail(f"situacao esperada='aprovado', obtida='{aud_ap['situacao']}'")
if aud_ap['data_conclusao'] is None:
    fail("data_conclusao não foi setada ao aprovar")
ok(f"Aprovado: situacao='{aud_ap['situacao']}', data_conclusao={aud_ap['data_conclusao']}")
ok(f"Parecer registrado: '{aud_ap['parecer']}'")

# ─── TESTE 4: vw_ordens_prontas_volta ────────────────────────────────────────
section("Teste 4: vw_ordens_prontas_volta inclui a ordem aprovada")

cur.execute("SELECT id FROM alissonerp.vw_ordens_prontas_volta WHERE id=%s", (ORDEM_ID,))
r = cur.fetchone()
if not r:
    fail(f"Ordem {ORDEM_ID} NÃO aparece em vw_ordens_prontas_volta após aprovação")
ok(f"Ordem {ORDEM_ID} aparece em vw_ordens_prontas_volta ✓")

cur.execute("SELECT COUNT(*) AS total FROM alissonerp.vw_ordens_prontas_volta")
total_volta = cur.fetchone()['total']
ok(f"Total ordens prontas para volta: {total_volta}")

# ─── TESTE 5: Reprovar com motivo → ordem retrabalho ─────────────────────────
section("Teste 5: Reprovar com motivo → ordem retrabalho criada")

# Criar nova auditoria de teste para reprovar
cur.execute("""
    INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, peso_final, pmc, quebra, quebra_percentual,
        total_metal, retorno_metal, metal_externo, ourives_nome
    ) VALUES (
        'pendente', 'alerta', 'saida_pcp', %s,
        5.0, 4.0, 4.0, 1.0, 20.0,
        5.0, 0.0, 0.0, 'Teste E2E'
    ) RETURNING id
""", (ORDEM_ID,))
AUD2_ID = cur.fetchone()['id']
ok(f"Auditoria de teste #{AUD2_ID} criada para reprovar")

cur.execute("""
    UPDATE alissonerp.auditorias
    SET situacao = 'reprovado',
        motivo_reprovacao = 'Teste E2E: solda irregular na parte traseira'
    WHERE id = %s
""", (AUD2_ID,))

cur.execute("SELECT situacao, ordem_retrabalho_id, data_conclusao FROM alissonerp.auditorias WHERE id=%s", (AUD2_ID,))
aud_rep = cur.fetchone()

if aud_rep['situacao'] != 'reprovado':
    fail(f"situacao esperada='reprovado', obtida='{aud_rep['situacao']}'")
ok(f"Reprovado: situacao='{aud_rep['situacao']}'")

if aud_rep['ordem_retrabalho_id'] is None:
    fail("ordem_retrabalho_id não foi setado ao reprovar")
ok(f"Ordem retrabalho criada: id={aud_rep['ordem_retrabalho_id']}")

RET_ORDEM_ID = aud_rep['ordem_retrabalho_id']
cur.execute("SELECT numero_ordem, tipo_ordem, status, origem_reprovacao FROM alissonerp.ordens WHERE id=%s", (RET_ORDEM_ID,))
ret_ord = cur.fetchone()
ok(f"Ordem retrabalho: numero='{ret_ord['numero_ordem']}', tipo='{ret_ord['tipo_ordem']}', status='{ret_ord['status']}'")

if str(ret_ord['tipo_ordem']) != 'reparo':
    fail(f"tipo_ordem esperado='reparo', obtido='{ret_ord['tipo_ordem']}'")
ok(f"tipo_ordem='reparo', origem_reprovacao='{ret_ord['origem_reprovacao']}' ✓")

# Verificar PCP criado para retrabalho
cur.execute("SELECT id, etapas FROM alissonerp.pcp WHERE ordem_id=%s ORDER BY id DESC LIMIT 1", (RET_ORDEM_ID,))
pcp_ret = cur.fetchone()
if not pcp_ret:
    fail("PCP não foi criado para ordem retrabalho")
ok(f"PCP retrabalho: id={pcp_ret['id']}, etapas='{pcp_ret['etapas']}' ✓")

# ─── Cleanup ──────────────────────────────────────────────────────────────────
section("Cleanup: removendo dados de teste")

# Remover PCP e saida da ordem retrabalho
# Primeiro NULL a FK em auditorias para evitar FK violation
cur.execute("UPDATE alissonerp.auditorias SET ordem_retrabalho_id=NULL WHERE ordem_retrabalho_id=%s", (RET_ORDEM_ID,))
cur.execute("DELETE FROM alissonerp.pcp WHERE ordem_id=%s", (RET_ORDEM_ID,))
cur.execute("DELETE FROM alissonerp.saidas_ordem WHERE ordem_id=%s", (RET_ORDEM_ID,))
cur.execute("DELETE FROM alissonerp.ordens WHERE id=%s", (RET_ORDEM_ID,))
ok(f"Ordem retrabalho #{RET_ORDEM_ID} removida")

# Remover auditorias de teste
cur.execute("DELETE FROM alissonerp.auditorias WHERE id IN (%s, %s)", (AUD_ID, AUD2_ID))
ok(f"Auditorias #{AUD_ID} e #{AUD2_ID} removidas")

# Remover saida de teste
cur.execute("DELETE FROM alissonerp.saidas_ordem WHERE id=%s", (NEW_SAIDA_ID,))
ok(f"Saida #{NEW_SAIDA_ID} removida")

# Restaurar PCP
cur.execute("""
    UPDATE alissonerp.pcp SET
        etapas = %(etapas)s,
        peso_final = %(peso_final)s,
        pmc = %(pmc)s,
        quebra = %(quebra)s,
        porcentagem_de_quebra = %(porcentagem_de_quebra)s,
        data_conclusao = %(data_conclusao)s,
        saida_ordem_id = %(saida_ordem_id)s
    WHERE id = %(id)s
""", {**pcp_original, 'id': PCP_ID})
ok(f"PCP #{PCP_ID} restaurado: etapas='{pcp_original['etapas']}'")

# Restaurar Ordem
cur.execute("""
    UPDATE alissonerp.ordens SET
        status = %(status)s,
        data_conclusao = %(data_conclusao)s
    WHERE id = %(id)s
""", {**ord_original, 'id': ORDEM_ID})
ok(f"Ordem #{ORDEM_ID} restaurada: status='{ord_original['status']}'")

print(f"\n  \033[32mTodos os 5 testes passaram. Módulo Auditoria OK.\033[0m\n")
conn.close()
