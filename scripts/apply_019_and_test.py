"""
apply_019_and_test.py — Aplica migration 019 e executa suite de testes
Flow 1002: Transferência entre setores
Flow 1003: Saída da ordem (PMC/quebra)
"""
import psycopg2, sys, os
sys.stdout.reconfigure(encoding='utf-8')

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

MIGRATION_PATH = os.path.join(os.path.dirname(__file__),
    "..", "supabase", "migrations", "019_trigger_transferencia_saida.sql")

conn = psycopg2.connect(DB, connect_timeout=10)
conn.autocommit = True
cur = conn.cursor()

# ─── Helpers ────────────────────────────────────────────────────────────────

def ok(msg):  print(f"  ✓ {msg}")
def fail(msg): print(f"  ✗ {msg}"); sys.exit(1)

def q1(sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()

def qall(sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()

# ─── 1. Aplicar migration ────────────────────────────────────────────────────

print("\n══════ APLICANDO MIGRATION 019 ══════")
with open(MIGRATION_PATH, encoding="utf-8") as f:
    sql = f.read()
cur.execute(sql)
ok("Migration 019 executada")

# ─── 2. Verificar funções e triggers ────────────────────────────────────────

print("\n══════ VERIFICANDO OBJETOS ══════")

for fn in ("fn_processar_transferencia", "fn_processar_saida_ordem"):
    row = q1("""
        SELECT p.proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'alissonerp' AND p.proname = %s
    """, (fn,))
    if row: ok(f"Função {fn} existe")
    else:   fail(f"Função {fn} NÃO encontrada")

for trg in ("trg_after_transferencia_ordem", "trg_after_saida_ordem"):
    row = q1("SELECT tgname FROM pg_trigger WHERE tgname = %s", (trg,))
    if row: ok(f"Trigger {trg} existe")
    else:   fail(f"Trigger {trg} NÃO encontrado")

# ─── 3. Estado inicial dos dados de teste ───────────────────────────────────

print("\n══════ ESTADO INICIAL (pcp_id=2, ordem_id=3) ══════")

pcp = q1("SELECT id, etapas, total_metal, retorno_metal, metal_externo, total_geral_outros_pesos, pmc, quebra, porcentagem_de_quebra, peso_final FROM alissonerp.pcp WHERE id = 2")
if not pcp:
    fail("PCP id=2 não encontrado — execute seed de teste antes")
print(f"  PCP: etapas={pcp[1]}, total_metal={pcp[2]}, retorno_metal={pcp[3]}")

ordem = q1("SELECT id, status, local_atual, setor_atual FROM alissonerp.ordens WHERE id = 3")
if not ordem:
    fail("Ordem id=3 não encontrada — execute seed de teste antes")
print(f"  Ordem: status={ordem[1]}, local_atual={ordem[2]}, setor_atual={ordem[3]}")

itens = qall("SELECT insumo_id, deposito_id, peso FROM alissonerp.itens_ordem_insumos WHERE ordem_id = 3")
print(f"  Itens em itens_ordem_insumos: {itens}")

# ─── 4. Testar Flow 1002 — Transferência entre setores ──────────────────────

print("\n══════ FLOW 1002 — TESTE TRANSFERÊNCIA ══════")

# Verificar quantas transferencias existem antes
n_antes = q1("SELECT COUNT(*) FROM alissonerp.transferencias_ordem WHERE pcp_id = 2")[0]

# INSERT com destino preenchido
cur.execute("""
    INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id, setor_id, deposito_id, obs)
    VALUES (2, 3, 1, 2, 'Teste Flow 1002 — Ourives 1')
""")
ok("INSERT transferencias_ordem (setor_id=1, deposito_id=2) executado")

# Verificar PCP etapas → em_andamento
pcp_depois = q1("SELECT etapas, updated_at FROM alissonerp.pcp WHERE id = 2")
if str(pcp_depois[0]) == "em_andamento":
    ok(f"PCP etapas → em_andamento")
else:
    fail(f"PCP etapas esperado=em_andamento, obtido={pcp_depois[0]}")

# Verificar ordem local_atual / setor_atual atualizados
ordem_depois = q1("SELECT local_atual, setor_atual FROM alissonerp.ordens WHERE id = 3")
if ordem_depois[0] == 2 and ordem_depois[1] == 1:
    ok(f"Ordem local_atual=2, setor_atual=1 ✓")
else:
    fail(f"Ordem local/setor esperado=(2,1), obtido={ordem_depois}")

# Verificar nova transferencia vazia criada
n_depois = q1("SELECT COUNT(*) FROM alissonerp.transferencias_ordem WHERE pcp_id = 2")[0]
if n_depois == n_antes + 2:  # +1 (nossa) +1 (vazia criada pelo trigger)
    ok(f"Transferencias: {n_antes} → {n_depois} (+1 preenchida, +1 vazia)")
else:
    fail(f"Esperado {n_antes+2} transferencias, encontrado {n_depois}")

# Verificar transferencia vazia
t_vazia = q1("SELECT setor_id, deposito_id FROM alissonerp.transferencias_ordem WHERE pcp_id = 2 ORDER BY id DESC LIMIT 1")
if t_vazia[0] is None and t_vazia[1] is None:
    ok("Transferência vazia criada (setor_id=NULL, deposito_id=NULL)")
else:
    fail(f"Transferência vazia inesperada: {t_vazia}")

# Verificar movimentações TED (só se havia itens com saldo)
if itens:
    movs = qall("""
        SELECT marcador, deposito_id, setor_id, entrada, saida
        FROM alissonerp.movimentacoes_estoque
        WHERE marcador = 'TED' AND ordem_id = 3
        ORDER BY id DESC LIMIT 10
    """)
    if movs:
        ok(f"CE TED registradas: {len(movs)} linhas")
        for m in movs:
            print(f"    marcador={m[0]}, dep={m[1]}, set={m[2]}, entrada={m[3]}, saida={m[4]}")
    else:
        print("  (itens com peso=0 ou local_atual era NULL — sem TED gerado)")
else:
    print("  (sem itens em itens_ordem_insumos — TED não gerado)")

# ─── 5. Testar Flow 1003 — Saída da ordem ───────────────────────────────────

print("\n══════ FLOW 1003 — TESTE SAÍDA DA ORDEM ══════")

# Precisamos de um pcp com total_metal > 0 para o cálculo ter sentido
# Forçamos um total_metal no PCP de teste se ainda for 0
pcp_atual = q1("SELECT total_metal, retorno_metal FROM alissonerp.pcp WHERE id = 2")
if (pcp_atual[0] or 0) == 0:
    cur.execute("UPDATE alissonerp.pcp SET total_metal = 10.5, retorno_metal = 0 WHERE id = 2")
    ok("PCP total_metal setado para 10.5g (dado de teste)")

# INSERT saidas_ordem — peso_final = 9.80g (simulando produto pronto)
cur.execute("""
    INSERT INTO alissonerp.saidas_ordem (ordem_id, deposito_id, peso, obs)
    VALUES (3, 2, 9.80, 'Teste Flow 1003 — saída produto acabado')
    RETURNING id
""")
saida_id = cur.fetchone()[0]
ok(f"INSERT saidas_ordem id={saida_id} (peso=9.80g)")

# Verificar PCP → concluido com PMC/quebra
pcp_final = q1("""
    SELECT etapas, peso_final, pmc, quebra, porcentagem_de_quebra,
           saida_ordem_id, data_conclusao
    FROM alissonerp.pcp WHERE id = 2
""")
if str(pcp_final[0]) == "concluido":
    ok(f"PCP etapas → concluido")
else:
    fail(f"PCP etapas esperado=concluido, obtido={pcp_final[0]}")

print(f"  PMC={pcp_final[2]}g | Quebra={pcp_final[3]}g | %Quebra={pcp_final[4]}%")
print(f"  peso_final={pcp_final[1]}g | saida_ordem_id={pcp_final[5]} | data_conclusao={pcp_final[6]}")

if pcp_final[5] == saida_id:
    ok("saida_ordem_id corretamente vinculado")
else:
    fail(f"saida_ordem_id esperado={saida_id}, obtido={pcp_final[5]}")

# Verificar ordem → concluido
ordem_final = q1("SELECT status, data_conclusao FROM alissonerp.ordens WHERE id = 3")
if str(ordem_final[0]) == "concluido":
    ok(f"Ordem status → concluido")
else:
    fail(f"Ordem status esperado=concluido, obtido={ordem_final[0]}")

# Verificar auditoria
audit = q1("""
    SELECT situacao, tipo_auditoria, rota_processo
    FROM alissonerp.auditorias WHERE ordem_id = 3
    ORDER BY id DESC LIMIT 1
""")
if audit and audit[0] == "concluido" and audit[1] == "saida_pcp":
    ok(f"Auditoria criada: {audit}")
else:
    fail(f"Auditoria não encontrada ou incorreta: {audit}")

# Verificar movimentações SM/SP
movs_sm = qall("""
    SELECT marcador, deposito_id, entrada, saida, insumo_id
    FROM alissonerp.movimentacoes_estoque
    WHERE marcador IN ('SM','SP') AND ordem_id = 3
    ORDER BY id DESC LIMIT 10
""")
if movs_sm:
    ok(f"CE SM/SP registradas: {len(movs_sm)} linhas")
    for m in movs_sm:
        print(f"    marcador={m[0]}, dep={m[1]}, entrada={m[2]}, saida={m[3]}, insumo={m[4]}")
else:
    print("  (sem itens em itens_ordem_insumos com peso>0 — SM/SP não gerados)")

# ─── 6. Resumo final ────────────────────────────────────────────────────────

print("\n══════ RESUMO ══════")
print(f"  Transferencias PCP#2: {q1('SELECT COUNT(*) FROM alissonerp.transferencias_ordem WHERE pcp_id = 2')[0]}")
n_movs = q1('SELECT COUNT(*) FROM alissonerp.movimentacoes_estoque WHERE ordem_id = 3')[0]
print(f"  Movimentacoes ordem#3: {n_movs}")
print(f"  Auditorias ordem#3: {q1('SELECT COUNT(*) FROM alissonerp.auditorias WHERE ordem_id = 3')[0]}")
print(f"  PCP#2 etapas: {q1('SELECT etapas FROM alissonerp.pcp WHERE id=2')[0]}")
print(f"  Ordem#3 status: {q1('SELECT status FROM alissonerp.ordens WHERE id=3')[0]}")
print()
print("  Migration 019 OK — Flows 1002 e 1003 validados.")

conn.close()
