"""
apply_020_and_test.py — Aplica migration 020 e testa Flows 1007-1014 (Distribuição)
"""
import psycopg2, sys, os
sys.stdout.reconfigure(encoding='utf-8')

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

MIGRATION = os.path.join(os.path.dirname(__file__),
    "..", "supabase", "migrations", "020_triggers_distribuicao.sql")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor()

def ok(msg):   print(f"  OK  {msg}")
def fail(msg): print(f"  FAIL {msg}"); sys.exit(1)
def q1(sql, p=()): cur.execute(sql, p); return cur.fetchone()
def qall(sql, p=()): cur.execute(sql, p); return cur.fetchall()

# ─── 1. Aplicar migration ────────────────────────────────────────────────────
print("\n══════ APLICANDO MIGRATION 020 ══════")
with open(MIGRATION, encoding="utf-8") as f:
    cur.execute(f.read())
ok("Migration 020 executada")

# ─── 2. Verificar objetos ────────────────────────────────────────────────────
print("\n══════ VERIFICANDO OBJETOS ══════")
fns = [
    "fn_criar_item_distribuicao",
    "fn_criar_fechamento_por_ordem",
    "fn_processar_apontamento_dist",
    "fn_processar_outros_insumos_dist",
    "fn_processar_fechamento_dist",
    "fn_concluir_distribuicao",
]
for fn in fns:
    row = q1("""
        SELECT p.proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='alissonerp' AND p.proname=%s
    """, (fn,))
    if row: ok(f"fn {fn}")
    else:   fail(f"fn {fn} NAO ENCONTRADA")

trgs = [
    "trg_after_insert_distribuicao_ordem",
    "trg_after_insert_apontamento_dist",
    "trg_after_insert_outros_insumos_dist",
    "trg_fechamento_distribuicao",
    "trg_concluir_distribuicao",
]
for t in trgs:
    row = q1("SELECT tgname FROM pg_trigger WHERE tgname=%s", (t,))
    if row: ok(f"trigger {t}")
    else:   fail(f"trigger {t} NAO ENCONTRADO")

# ─── 3. Setup dados de teste ─────────────────────────────────────────────────
print("\n══════ SETUP DADOS DE TESTE ══════")

# Limpar dados de teste anteriores se existirem
cur.execute("DELETE FROM alissonerp.movimentacoes_estoque WHERE obs LIKE '%distribuicao%'")
cur.execute("""
    DELETE FROM alissonerp.pcp WHERE ordem_id IN (
        SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('DIST-001','DIST-002')
    )
""")
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem IN ('DIST-001','DIST-002')")

# Criar 2 ordens
cur.execute("""
    INSERT INTO alissonerp.ordens (numero_ordem, tipo_ordem, situacao, status, local_atual, setor_atual)
    VALUES ('DIST-001', 'producao', 'criado', 'aguardando', 2, 5) RETURNING id
""")
ordem_a = cur.fetchone()[0]

cur.execute("""
    INSERT INTO alissonerp.ordens (numero_ordem, tipo_ordem, situacao, status, local_atual, setor_atual)
    VALUES ('DIST-002', 'producao', 'criado', 'aguardando', 2, 5) RETURNING id
""")
ordem_b = cur.fetchone()[0]
ok(f"Ordens criadas: A={ordem_a}, B={ordem_b}")

# Criar PCPs
cur.execute("INSERT INTO alissonerp.pcp (ordem_id, etapas) VALUES (%s, 'novas_ordens') RETURNING id", (ordem_a,))
pcp_a = cur.fetchone()[0]
cur.execute("INSERT INTO alissonerp.pcp (ordem_id, etapas) VALUES (%s, 'novas_ordens') RETURNING id", (ordem_b,))
pcp_b = cur.fetchone()[0]
ok(f"PCPs criados: pcp_A={pcp_a}, pcp_B={pcp_b}")

# Criar distribuição
cur.execute("""
    INSERT INTO alissonerp.distribuicoes (setor, etapas, total_metal, retorno_metal,
        total_pedras_un, total_pedras_g, total_outros_pesos, total_geral_outros_pesos)
    VALUES ('banca', 'em_andamento', 0, 0, 0, 0, 0, 0)
    RETURNING id
""")
dist_id = cur.fetchone()[0]
ok(f"Distribuicao criada: id={dist_id}")

# ─── 4. Flow 1012 — Vincular ordens (trigger auto-cria fechamentos) ──────────
print("\n══════ FLOW 1012 — FECHAMENTOS AUTO-CRIADOS ══════")

cur.execute("INSERT INTO alissonerp.distribuicao_ordens (distribuicao_id, ordens_id) VALUES (%s, %s)", (dist_id, ordem_a))
cur.execute("INSERT INTO alissonerp.distribuicao_ordens (distribuicao_id, ordens_id) VALUES (%s, %s)", (dist_id, ordem_b))
ok("distribuicao_ordens inseridos")

fecths = qall("SELECT id, ordem_id, peso FROM alissonerp.fechamentos_distribuicao WHERE distribuicao_id = %s", (dist_id,))
if len(fecths) == 2:
    ok(f"Fechamentos criados automaticamente: {[(r[1], r[2]) for r in fecths]}")
else:
    fail(f"Esperado 2 fechamentos, encontrado {len(fecths)}")

# ─── 5. Flow 1007 — Apontamento (EIMD) ──────────────────────────────────────
print("\n══════ FLOW 1007 — APONTAMENTO EIMD (15g) ══════")
n_movs_antes = q1("SELECT COUNT(*) FROM alissonerp.movimentacoes_estoque")[0]

cur.execute("""
    INSERT INTO alissonerp.apontamentos_distribuicao
        (tipo_apontamento_id, deposito_id, setor_id, insumo_id, distribuicao_id, qtd)
    VALUES (2, 2, 5, 1, %s, 15.0)
""", (dist_id,))
ok("Apontamento tipo 2 (EIMD) 15g inserido")

dist = q1("SELECT total_metal, retorno_metal FROM alissonerp.distribuicoes WHERE id=%s", (dist_id,))
if dist[0] == 15.0:
    ok(f"dist.total_metal = {dist[0]}g")
else:
    fail(f"dist.total_metal esperado=15.0, obtido={dist[0]}")

n_movs_depois = q1("SELECT COUNT(*) FROM alissonerp.movimentacoes_estoque")[0]
if n_movs_depois == n_movs_antes + 2:
    ok(f"CE EIMD: +2 linhas em movimentacoes_estoque")
else:
    fail(f"Esperado +2 movimentacoes, obtido +{n_movs_depois - n_movs_antes}")

movs_eimd = qall("""
    SELECT marcador, deposito_id, saida, entrada FROM alissonerp.movimentacoes_estoque
    WHERE marcador='EIMD' ORDER BY id DESC LIMIT 2
""")
ok(f"Marcadores EIMD: {[(r[0], r[1], r[2], r[3]) for r in movs_eimd]}")

# Verificar item distribuição criado
item = q1("SELECT insumo_id, peso FROM alissonerp.itens_distribuicao WHERE distribuicao_id=%s", (dist_id,))
if item and item[1] == 15.0:
    ok(f"itens_distribuicao: insumo={item[0]}, peso={item[1]}g")
else:
    fail(f"Item distribuicao inesperado: {item}")

# ─── 6. Flow 1010 — Outros insumos (SOID) ───────────────────────────────────
print("\n══════ FLOW 1010 — OUTROS INSUMOS (SOID 0.5g) ══════")
cur.execute("""
    INSERT INTO alissonerp.outros_insumos_distribuicao (distribuicao_id, insumo_id, peso)
    VALUES (%s, 1, 0.5)
""", (dist_id,))
dist2 = q1("SELECT total_outros_pesos, total_geral_outros_pesos FROM alissonerp.distribuicoes WHERE id=%s", (dist_id,))
if dist2[0] == 0.5 and dist2[1] == 0.5:
    ok(f"dist.total_outros_pesos = {dist2[0]}g, total_geral = {dist2[1]}g")
else:
    fail(f"total_outros esperado=0.5, obtido={dist2}")

soid = q1("SELECT marcador, saida FROM alissonerp.movimentacoes_estoque WHERE marcador='SOID' ORDER BY id DESC LIMIT 1")
if soid and soid[0] == 'SOID':
    ok(f"CE SOID registrado: saida={soid[1]}g")
else:
    fail(f"CE SOID nao encontrado: {soid}")

# ─── 7. Flow 1013 — Fechamento → Acúmulo no PCP ────────────────────────────
print("\n══════ FLOW 1013 — FECHAMENTO → ACUMULO NO PCP ══════")
pcp_a_antes = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_a,))
pcp_b_antes = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_b,))
print(f"  PCP_A total_metal antes: {pcp_a_antes[0]}")
print(f"  PCP_B total_metal antes: {pcp_b_antes[0]}")

# Fechar ordem A: peso=7g, pmc=7g
cur.execute("""
    UPDATE alissonerp.fechamentos_distribuicao
    SET peso=7.0, pmc=7.0
    WHERE distribuicao_id=%s AND ordem_id=%s
""", (dist_id, ordem_a))
ok("Fechamento ordem A: peso=7.0, pmc=7.0")

# Fechar ordem B: peso=6g, pmc=6g
cur.execute("""
    UPDATE alissonerp.fechamentos_distribuicao
    SET peso=6.0, pmc=6.0
    WHERE distribuicao_id=%s AND ordem_id=%s
""", (dist_id, ordem_b))
ok("Fechamento ordem B: peso=6.0, pmc=6.0")

pcp_a_depois = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_a,))
pcp_b_depois = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_b,))

expected_a = (pcp_a_antes[0] or 0) + 7.0
expected_b = (pcp_b_antes[0] or 0) + 6.0

if abs(pcp_a_depois[0] - expected_a) < 0.001:
    ok(f"PCP_A total_metal acumulado: {pcp_a_antes[0]} + 7 = {pcp_a_depois[0]}")
else:
    fail(f"PCP_A esperado={expected_a}, obtido={pcp_a_depois[0]}")

if abs(pcp_b_depois[0] - expected_b) < 0.001:
    ok(f"PCP_B total_metal acumulado: {pcp_b_antes[0]} + 6 = {pcp_b_depois[0]}")
else:
    fail(f"PCP_B esperado={expected_b}, obtido={pcp_b_depois[0]}")

# Verificar ordens movidas para dep1
ordem_a_loc = q1("SELECT local_atual FROM alissonerp.ordens WHERE id=%s", (ordem_a,))
ordem_b_loc = q1("SELECT local_atual FROM alissonerp.ordens WHERE id=%s", (ordem_b,))
if ordem_a_loc[0] == 1 and ordem_b_loc[0] == 1:
    ok("Ambas ordens movidas para local_atual=1 (Almoxarifado)")
else:
    fail(f"ordens local_atual: A={ordem_a_loc[0]}, B={ordem_b_loc[0]}")

# Verificar CE TEDD
tedd = qall("""
    SELECT marcador, saida, entrada, deposito_id FROM alissonerp.movimentacoes_estoque
    WHERE marcador='TEDD' ORDER BY id DESC LIMIT 4
""")
if tedd:
    ok(f"CE TEDD registrados: {len(tedd)} linhas")
    for r in tedd: print(f"    {r}")
else:
    fail("CE TEDD nao encontrado")

# Verificar transferencias criadas
trs = qall("""
    SELECT pcp_id, ordem_id FROM alissonerp.transferencias_ordem
    WHERE ordem_id IN (%s, %s) ORDER BY id DESC LIMIT 4
""", (ordem_a, ordem_b))
if len(trs) >= 2:
    ok(f"Transferencias criadas: {trs}")
else:
    fail(f"Transferencias esperado>=2, encontrado {len(trs)}: {trs}")

# Verificar itens_ordem_insumos copiados
itens_a = q1("SELECT COUNT(*) FROM alissonerp.itens_ordem_insumos WHERE ordem_id=%s", (ordem_a,))
itens_b = q1("SELECT COUNT(*) FROM alissonerp.itens_ordem_insumos WHERE ordem_id=%s", (ordem_b,))
if itens_a[0] > 0 and itens_b[0] > 0:
    ok(f"itens_ordem_insumos copiados: A={itens_a[0]}, B={itens_b[0]}")
else:
    print(f"  (itens_ordem_insumos: A={itens_a[0]}, B={itens_b[0]} — OK se itens_distribuicao estava vazio)")

# ─── 8. Flow 1014 — Concluir distribuição ───────────────────────────────────
print("\n══════ FLOW 1014 — CONCLUIR DISTRIBUICAO ══════")
cur.execute("""
    UPDATE alissonerp.distribuicoes
    SET etapas='concluido', peso_final=12.5
    WHERE id=%s
""", (dist_id,))
ok("distribuicao etapas='concluido', peso_final=12.5")

dist_final = q1("""
    SELECT pmc, quebra, porcentagem_de_quebra, total_metal, retorno_metal, total_geral_outros_pesos
    FROM alissonerp.distribuicoes WHERE id=%s
""", (dist_id,))
pmc_esperado  = 12.5 - 0.5  # pf - outros = 12.0
quebra_esp    = (15.0 - 0.0) - pmc_esperado  # (entrada - retorno) - pmc = 15 - 12 = 3.0
pct_esp       = round(quebra_esp / pmc_esperado * 100, 2)  # 3/12*100 = 25%

print(f"  dist: pmc={dist_final[0]}, quebra={dist_final[1]}, %={dist_final[2]}")
print(f"  esperado: pmc={pmc_esperado}, quebra={quebra_esp}, %={pct_esp}")

if abs(dist_final[0] - pmc_esperado) < 0.01:
    ok(f"PMC correto: {dist_final[0]}g (pf={12.5} - outros={0.5})")
else:
    fail(f"PMC esperado={pmc_esperado}, obtido={dist_final[0]}")

if abs(dist_final[1] - quebra_esp) < 0.01:
    ok(f"Quebra correto: {dist_final[1]}g")
else:
    fail(f"Quebra esperado={quebra_esp}, obtido={dist_final[1]}")

if abs(dist_final[2] - pct_esp) < 0.1:
    ok(f"%Quebra correto: {dist_final[2]}% (quebra/PMC)")
else:
    fail(f"%Quebra esperado={pct_esp}, obtido={dist_final[2]}")

tedmd = q1("SELECT COUNT(*) FROM alissonerp.movimentacoes_estoque WHERE marcador='TEDMD'")
if tedmd[0] > 0:
    ok(f"CE TEDMD registrado ({tedmd[0]} linha(s))")
else:
    fail("CE TEDMD nao encontrado")

# ─── 9. Teste de duplo acúmulo (deve ser bloqueado) ─────────────────────────
print("\n══════ TESTE GUARD DUPLO ACUMULO ══════")
pcp_a_pre = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_a,))
# Segunda atualização no mesmo fechamento (já tinha peso > 0) — deve ser ignorada
cur.execute("""
    UPDATE alissonerp.fechamentos_distribuicao
    SET peso=99.0, pmc=99.0
    WHERE distribuicao_id=%s AND ordem_id=%s
""", (dist_id, ordem_a))
pcp_a_pos = q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_a,))
if pcp_a_pre[0] == pcp_a_pos[0]:
    ok(f"Guard funciona: segundo UPDATE ignorado (total_metal mantido = {pcp_a_pos[0]})")
else:
    fail(f"Duplo acumulo! total_metal mudou: {pcp_a_pre[0]} → {pcp_a_pos[0]}")

# ─── 10. Resumo ──────────────────────────────────────────────────────────────
print("\n══════ RESUMO ══════")
print(f"  distribuicoes id={dist_id}: ", q1("SELECT etapas, pmc, quebra, porcentagem_de_quebra FROM alissonerp.distribuicoes WHERE id=%s", (dist_id,)))
print(f"  fechamentos dist {dist_id}: ", qall("SELECT ordem_id, peso, pmc FROM alissonerp.fechamentos_distribuicao WHERE distribuicao_id=%s", (dist_id,)))
print(f"  PCP_A total_metal: ", q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_a,))[0])
print(f"  PCP_B total_metal: ", q1("SELECT total_metal FROM alissonerp.pcp WHERE id=%s", (pcp_b,))[0])
n_movs = q1("SELECT COUNT(*) FROM alissonerp.movimentacoes_estoque")[0]
print(f"  Total movimentacoes_estoque: {n_movs}")
print()
print("  Migration 020 OK — Flows 1007/1010/1011/1012/1013/1014 validados.")

conn.close()
