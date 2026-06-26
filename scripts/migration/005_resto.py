"""
Migração 005: Distribuições + Protocolos + Transferências + Aprovações + Preparações
directus.distribuicao      → alissonerp.distribuicoes
directus.protocolo         → alissonerp.protocolos
directus.transferencia_ordem → alissonerp.transferencias_ordem
directus.aprovar_consultora  → alissonerp.aprovacoes_consultora
directus.preparando_entrega  → alissonerp.preparacoes_entrega

Notas:
- Triggers de negócio desabilitados durante migração
- motoboy_id / recebedor_id em protocolos → NULL (não existe no directus)
- protocolo.rota 'Loja -> Fabrica' → 'ida', 'Fabrica -> Loja' → 'volta'
- preparando_entrega.etapas '3' → NULL (não existe no enum)
- distribuicao.saida → NULL em todos os registros directus
- distribuicao_ordens directus = 0 linhas → pular
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
counts = {}
for d, a in [
    ('distribuicao','distribuicoes'),
    ('protocolo','protocolos'),
    ('transferencia_ordem','transferencias_ordem'),
    ('aprovar_consultora','aprovacoes_consultora'),
    ('preparando_entrega','preparacoes_entrega'),
]:
    cur.execute(f"SELECT count(*) AS n FROM directus.{d}")
    nd = cur.fetchone()['n']
    cur.execute(f"SELECT count(*) AS n FROM alissonerp.{a}")
    na = cur.fetchone()['n']
    counts[a] = nd
    info(f"directus.{d}: {nd}   alissonerp.{a} antes: {na}")

# ── DISTRIBUIÇÕES ─────────────────────────────────────────────────────────────
section("MIGRANDO DISTRIBUIÇÕES")
cur.execute("ALTER TABLE alissonerp.distribuicoes DISABLE TRIGGER trg_audit_distribuicoes")
cur.execute("ALTER TABLE alissonerp.distribuicoes DISABLE TRIGGER trg_concluir_distribuicao")

cur.execute("""
INSERT INTO alissonerp.distribuicoes (
    id, etapas, setor, operador, saida_id,
    total_metal, retorno_metal,
    total_pedras_un, total_pedras_g,
    total_outros_pesos, total_geral_outros_pesos,
    pmc, quebra, porcentagem_de_quebra, peso_final,
    created_at, updated_at, created_by
)
SELECT
    d.id,
    CASE d.etapas
        WHEN '1' THEN 'em_andamento'::alissonerp.enum_etapas_distribuicao
        WHEN '2' THEN 'concluido'::alissonerp.enum_etapas_distribuicao
        ELSE NULL
    END,
    CASE d.setor
        WHEN '1' THEN 'fundicao'::alissonerp.enum_setor_distribuicao
        WHEN '2' THEN 'aliancas'::alissonerp.enum_setor_distribuicao
        WHEN '3' THEN 'cnc'::alissonerp.enum_setor_distribuicao
        WHEN '4' THEN 'laser'::alissonerp.enum_setor_distribuicao
        WHEN '5' THEN 'banca'::alissonerp.enum_setor_distribuicao
        WHEN '6' THEN 'tamboreador'::alissonerp.enum_setor_distribuicao
        WHEN '7' THEN 'epg'::alissonerp.enum_setor_distribuicao
        ELSE NULL
    END,
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.operador) THEN d.operador ELSE NULL END,
    NULL,   -- d.saida é NULL em todos os registros directus
    COALESCE(d.total_metal, 0),
    COALESCE(d.retorno_metal, 0),
    COALESCE(d.total_pedras_un, 0),
    COALESCE(d.total_pedras_g, 0),
    COALESCE(d.total_outros_pesos, 0),
    COALESCE(d.total_geral_outros_pesos, 0),
    COALESCE(d.pmc, 0),
    COALESCE(d.quebra, 0),
    COALESCE(d.porcentagem_de_quebra, 0),
    COALESCE(d.peso_final, 0),
    COALESCE(d.date_created, now()),
    COALESCE(d.date_updated, d.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_created) THEN d.user_created ELSE NULL END
FROM directus.distribuicao d
ON CONFLICT (id) DO NOTHING
""")
n = cur.rowcount
ok(f"Inseridas: {n} distribuições")
cur.execute("SELECT setval('alissonerp.distribuicoes_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.distribuicoes))")

cur.execute("ALTER TABLE alissonerp.distribuicoes ENABLE TRIGGER trg_audit_distribuicoes")
cur.execute("ALTER TABLE alissonerp.distribuicoes ENABLE TRIGGER trg_concluir_distribuicao")

# ── ATUALIZAR ordens.distribuicao_id ─────────────────────────────────────────
# (distribuicao_ordens no directus tem 0 linhas — não há mapeamento direto)
# Heurística: o PCP tem saida_ordem_id que indica a distribuição
# → pular por enquanto, campo já é NULL
info("distribuicao_id nas ordens permanece NULL (sem dados em directus.distribuicao_ordens)")

# ── PROTOCOLOS ────────────────────────────────────────────────────────────────
section("MIGRANDO PROTOCOLOS")
cur.execute("ALTER TABLE alissonerp.protocolos DISABLE TRIGGER trg_audit_protocolos")
cur.execute("ALTER TABLE alissonerp.protocolos DISABLE TRIGGER trg_concluir_protocolo")

cur.execute("""
INSERT INTO alissonerp.protocolos (
    id, direcao, etapas,
    motoboy_id, recebedor_id,
    data_conclusao,
    created_at, updated_at, created_by
)
SELECT
    p.id,
    CASE
        WHEN p.rota ILIKE '%loja%fabrica%' OR p.rota ILIKE '%ida%' THEN 'ida'::alissonerp.enum_direcao_protocolo
        WHEN p.rota ILIKE '%fabrica%loja%' OR p.rota ILIKE '%volta%' THEN 'volta'::alissonerp.enum_direcao_protocolo
        ELSE 'ida'::alissonerp.enum_direcao_protocolo
    END,
    CASE p.etapas
        WHEN '1' THEN 'pendente'::alissonerp.enum_etapas_protocolo
        WHEN '2' THEN 'concluido'::alissonerp.enum_etapas_protocolo
        ELSE NULL
    END,
    NULL,   -- motoboy_id não existe no directus
    NULL,   -- recebedor_id não existe no directus
    p.data_conclusao,
    COALESCE(p.date_created, now()),
    COALESCE(p.date_updated, p.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_created) THEN p.user_created ELSE NULL END
FROM directus.protocolo p
ON CONFLICT (id) DO NOTHING
""")
n = cur.rowcount
ok(f"Inseridas: {n} protocolos")
cur.execute("SELECT setval('alissonerp.protocolos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.protocolos))")

cur.execute("ALTER TABLE alissonerp.protocolos ENABLE TRIGGER trg_audit_protocolos")
cur.execute("ALTER TABLE alissonerp.protocolos ENABLE TRIGGER trg_concluir_protocolo")

# ── TRANSFERÊNCIAS DE ORDEM ───────────────────────────────────────────────────
section("MIGRANDO TRANSFERÊNCIAS DE ORDEM")
cur.execute("ALTER TABLE alissonerp.transferencias_ordem DISABLE TRIGGER trg_after_transferencia_ordem")

cur.execute("""
INSERT INTO alissonerp.transferencias_ordem (
    id, pcp_id, ordem_id, setor_id, deposito_id, obs,
    created_at, updated_at, created_by
)
SELECT
    t.id,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.pcp p WHERE p.id = t.pcp) THEN t.pcp ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = t.ordem_id) THEN t.ordem_id ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.setores s WHERE s.id = t.setor_id) THEN t.setor_id ELSE NULL END,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.depositos d WHERE d.id = t.deposito_id) THEN t.deposito_id ELSE NULL END,
    NULL,   -- obs não existe no directus
    COALESCE(t.date_created, now()),
    COALESCE(t.date_updated, t.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_created) THEN t.user_created ELSE NULL END
FROM directus.transferencia_ordem t
ON CONFLICT (id) DO NOTHING
""")
n = cur.rowcount
ok(f"Inseridas: {n} transferências de ordem")
cur.execute("SELECT setval('alissonerp.transferencias_ordem_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.transferencias_ordem))")

cur.execute("ALTER TABLE alissonerp.transferencias_ordem ENABLE TRIGGER trg_after_transferencia_ordem")

# ── APROVAÇÕES CONSULTORA ─────────────────────────────────────────────────────
section("MIGRANDO APROVAÇÕES CONSULTORA")
cur.execute("ALTER TABLE alissonerp.aprovacoes_consultora DISABLE TRIGGER trg_aprovacao_entrega")

cur.execute("""
INSERT INTO alissonerp.aprovacoes_consultora (
    id, etapas, ordem_id, consultora_id, obs,
    created_at, updated_at, created_by
)
SELECT
    a.id,
    CASE a.etapas
        WHEN '1' THEN 'pendente'::alissonerp.enum_etapas_aprovacao
        WHEN '2' THEN 'aguardando'::alissonerp.enum_etapas_aprovacao
        WHEN '3' THEN 'aprovado'::alissonerp.enum_etapas_aprovacao
        WHEN '4' THEN 'reprovado'::alissonerp.enum_etapas_aprovacao
        ELSE NULL
    END,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = a.ordem_id) THEN a.ordem_id ELSE NULL END,
    a.consultora_id,
    NULL,   -- obs não existe no directus
    COALESCE(a.date_created, now()),
    COALESCE(a.date_updated, a.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_created) THEN a.user_created ELSE NULL END
FROM directus.aprovar_consultora a
ON CONFLICT (id) DO NOTHING
""")
n = cur.rowcount
ok(f"Inseridas: {n} aprovações de consultora")
cur.execute("SELECT setval('alissonerp.aprovacoes_consultora_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.aprovacoes_consultora))")

cur.execute("ALTER TABLE alissonerp.aprovacoes_consultora ENABLE TRIGGER trg_aprovacao_entrega")

# ── PREPARAÇÕES DE ENTREGA ────────────────────────────────────────────────────
section("MIGRANDO PREPARAÇÕES DE ENTREGA")
# Sem triggers para desabilitar

cur.execute("""
INSERT INTO alissonerp.preparacoes_entrega (
    id, etapas, ordem_id,
    created_at, updated_at, created_by
)
SELECT
    p.id,
    CASE p.etapas
        WHEN '1' THEN 'pendente'::alissonerp.enum_etapas_entrega
        WHEN '2' THEN 'concluido'::alissonerp.enum_etapas_entrega
        ELSE NULL   -- '3' não existe no enum
    END,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.ordens o WHERE o.id = p.ordem_id) THEN p.ordem_id ELSE NULL END,
    COALESCE(p.date_created, now()),
    COALESCE(p.date_updated, p.date_created, now()),
    CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_created) THEN p.user_created ELSE NULL END
FROM directus.preparando_entrega p
ON CONFLICT (id) DO NOTHING
""")
n = cur.rowcount
ok(f"Inseridas: {n} preparações de entrega")
cur.execute("SELECT setval('alissonerp.preparacoes_entrega_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.preparacoes_entrega))")

conn.commit()

# ── VALIDAÇÃO ─────────────────────────────────────────────────────────────────
section("VALIDAÇÃO")
for a, nd in counts.items():
    cur.execute(f"SELECT count(*) AS n FROM alissonerp.{a}")
    na = cur.fetchone()['n']
    status = "\033[32mOK\033[0m" if na >= nd else "\033[31mFAIL\033[0m"
    print(f"  {status}  {a}: directus={nd}  alissonerp={na}")

conn.close()
print("\n  \033[32mMigração 005 — Resto concluída.\033[0m")
