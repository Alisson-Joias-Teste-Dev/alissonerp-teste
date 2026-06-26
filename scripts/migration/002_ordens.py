"""
Migração 002: Ordens
directus.ordens → alissonerp.ordens

Estratégia:
1. Remove dados de teste (directus_ordem_id IS NULL) respeitando FKs
2. Insere ordens do directus com mapeamento string→ENUM
3. distribuicao_id: inserido como NULL (FK para distribuicoes ainda não migrada)
   → atualizado num segundo passo após ordens todas inseridas
4. id_ordem_relacionada: inserido como NULL primeiro, depois UPDATE (auto-referência)
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
cur.execute("SELECT count(*) AS n FROM directus.ordens")
n_dir = cur.fetchone()['n']
info(f"directus.ordens: {n_dir}")
cur.execute("SELECT count(*) AS n FROM alissonerp.ordens")
info(f"alissonerp.ordens antes: {cur.fetchone()['n']}")

# ── LIMPAR DADOS DE TESTE ────────────────────────────────────────────────────
section("LIMPANDO DADOS DE TESTE")
# Dados de teste não têm directus_ordem_id (foi criado por migrations de teste)
# Limpar em ordem reversa de FK
cur.execute("SELECT id FROM alissonerp.ordens WHERE directus_ordem_id IS NULL")
test_ids = [r['id'] for r in cur.fetchall()]
info(f"Ordens de teste a remover: {test_ids}")

if test_ids:
    ids_str = ','.join(str(i) for i in test_ids)
    # child tables primeiro
    for tbl, col in [
        ('movimentacoes_estoque', 'ordem_id'),
        ('saidas_ordem', 'ordem_id'),
        ('pcp', 'ordem_id'),
        ('transferencias_ordem', 'ordem_id'),
        ('protocolo_ordens', 'ordem_id'),
        ('aprovacoes_consultora', 'ordem_id'),
        ('preparacoes_entrega', 'ordem_id'),
        ('auditorias', 'ordem_id'),
        ('distribuicao_ordens', 'ordens_id'),
        ('fechamentos_distribuicao', 'ordem_id'),
        ('itens_ordem_insumos', 'ordem_id'),
        ('itens_ordem_produtos', 'ordem_id'),
        ('pedras_ordens', 'ordem_id'),
        ('outros_insumos_pcp', 'ordem_id'),
    ]:
        cur.execute(f"DELETE FROM alissonerp.{tbl} WHERE {col} IN ({ids_str})")
        if cur.rowcount: info(f"  removidos {cur.rowcount} de {tbl}")
    # auto-referência
    cur.execute(f"UPDATE alissonerp.ordens SET id_ordem_relacionada = NULL WHERE id_ordem_relacionada IN ({ids_str})")
    # por fim as ordens
    cur.execute(f"DELETE FROM alissonerp.ordens WHERE id IN ({ids_str})")
    ok(f"Removidas {cur.rowcount} ordens de teste")
else:
    ok("Nenhuma ordem de teste encontrada")

# ── MIGRAR ORDENS ────────────────────────────────────────────────────────────
section("MIGRANDO ORDENS")
# Desabilitar triggers de audit (não precisamos de audit log para migração)
cur.execute("ALTER TABLE alissonerp.ordens DISABLE TRIGGER trg_audit_ordens")
cur.execute("ALTER TABLE alissonerp.ordens DISABLE TRIGGER trg_ordens_proteger_pdv")

SQL_INSERT = """
INSERT INTO alissonerp.ordens (
    id, numero_ordem, cliente_id, vendedor_id, pedido_id,
    tipo_ordem, data_entrega,
    peso_metal_negociado, peso_metal_externo,
    itens_para_fabricacao,
    situacao, status, rota, tipo_controle,
    setor_atual, local_atual,
    protocolo_loja,
    id_asana, motivo_reprovacao, origem_reprovacao,
    data_conclusao,
    directus_ordem_id,
    created_at, updated_at
)
SELECT
    o.id,
    o.numero_ordem,
    o.cliente_id,
    o.vendedor_id,
    o.pedido_id,
    CASE o.tipo_ordem
        WHEN '1' THEN 'producao'::alissonerp.enum_tipo_ordem
        WHEN '2' THEN 'reparo'::alissonerp.enum_tipo_ordem
        WHEN '3' THEN 'ajuste'::alissonerp.enum_tipo_ordem
        WHEN '4' THEN 'banho'::alissonerp.enum_tipo_ordem
        WHEN '5' THEN 'gravacao'::alissonerp.enum_tipo_ordem
        WHEN '6' THEN 'reposicao'::alissonerp.enum_tipo_ordem
        WHEN '7' THEN 'outro'::alissonerp.enum_tipo_ordem
        ELSE NULL
    END,
    o.data_entrega,
    COALESCE(o.peso_metal_negocido, 0),    -- typo histórico no banco directus
    COALESCE(o.peso_metal_externo, 0),
    o.itens_para_fabricacao,
    CASE o.situacao
        WHEN '1' THEN 'cancelado'::alissonerp.enum_situacao_ordem
        WHEN '2' THEN 'criado'::alissonerp.enum_situacao_ordem
        WHEN '3' THEN 'rascunho'::alissonerp.enum_situacao_ordem
        ELSE 'criado'::alissonerp.enum_situacao_ordem
    END,
    CASE o.status
        WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
        WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
        WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
        ELSE 'aguardando'::alissonerp.enum_status_ordem
    END,
    CASE o.rota
        WHEN '1' THEN 'pcp'::alissonerp.enum_rota_ordem
        WHEN '2' THEN 'protocolo'::alissonerp.enum_rota_ordem
        ELSE NULL
    END,
    o.tipo_controle,
    o.setor_atual,
    CASE WHEN EXISTS (SELECT 1 FROM alissonerp.depositos d WHERE d.id = o.local_atual) THEN o.local_atual ELSE NULL END,
    COALESCE(o.protocolo_loja::boolean, false),
    o.id_asana,
    o.motivo_reprovacao,
    o.origem_reprovacao,
    o.data_conclusao,
    o.id,                -- directus_ordem_id = mesmo ID
    COALESCE(o.date_created, now()),
    COALESCE(o.date_updated, now())
FROM directus.ordens o
ON CONFLICT (id) DO NOTHING
"""
cur.execute(SQL_INSERT)
n_ins = cur.rowcount
ok(f"Inseridas: {n_ins} ordens")

# ── ATUALIZAR AUTO-REFERÊNCIA id_ordem_relacionada ───────────────────────────
cur.execute("""
    UPDATE alissonerp.ordens ao
    SET id_ordem_relacionada = d.id_ordem_relacionada
    FROM directus.ordens d
    WHERE ao.id = d.id
      AND d.id_ordem_relacionada IS NOT NULL
      AND EXISTS (SELECT 1 FROM alissonerp.ordens ref WHERE ref.id = d.id_ordem_relacionada)
""")
ok(f"id_ordem_relacionada atualizado: {cur.rowcount} ordens")

# Resetar sequence
cur.execute("SELECT setval('alissonerp.ordens_id_seq', (SELECT COALESCE(MAX(id), 1) FROM alissonerp.ordens))")

# Reabilitar triggers
cur.execute("ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_audit_ordens")
cur.execute("ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_ordens_proteger_pdv")

conn.commit()

# ── VALIDAÇÃO ────────────────────────────────────────────────────────────────
section("VALIDAÇÃO")
cur.execute("SELECT count(*) AS n FROM alissonerp.ordens")
n_depois = cur.fetchone()['n']
info(f"directus: {n_dir}  alissonerp: {n_depois}")
if n_depois == n_dir:
    ok(f"Contagem BATE: {n_depois}")
else:
    fail(f"DIVERGE: directus={n_dir} alissonerp={n_depois}")

# Distribuição por enum
cur.execute("SELECT situacao, status, count(*) AS n FROM alissonerp.ordens GROUP BY situacao, status ORDER BY n DESC LIMIT 8")
info("Distribuição situacao/status:")
for r in cur.fetchall():
    print(f"    {str(r['situacao']):12s} / {str(r['status']):15s} = {r['n']}")

# Amostra
cur.execute("SELECT id, numero_ordem, situacao, status, tipo_ordem FROM alissonerp.ordens ORDER BY id DESC LIMIT 4")
info("Amostra (mais recentes):")
for r in cur.fetchall():
    print(f"    #{r['id']:5d}  {str(r['numero_ordem'] or '—'):15s}  sit={r['situacao']}  st={r['status']}  tipo={r['tipo_ordem']}")

conn.close()
print("\n  \033[32mMigração 002 — Ordens concluída.\033[0m")
