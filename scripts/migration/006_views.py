"""
Migração 006: Recriar Views apontando para alissonerp.* em vez de directus.*

Views reescritas (todas usadas pelo frontend):
- vw_kpis_gerais         → directus.ordens/pcp/protocolo  → alissonerp.ordens/pcp/protocolos
- vw_producao_mensal     → directus.ordens                → alissonerp.ordens
- vw_produtividade_ourives → directus.pcp + directus_users → alissonerp.pcp + user_profiles
- vw_ordens_por_tipo     → directus.ordens                → alissonerp.ordens
- vw_ordens_completa     → directus.ordens/setor/deposito → alissonerp
- vw_ordem_detalhe       → directus.*                     → alissonerp.*
- vw_transferencias_ordem→ directus.*                     → alissonerp.*
- vw_estoque_ordem       → directus.*                     → alissonerp.*
- vw_estoque_directus_saldo → directus.*                  → alissonerp.*
- vw_insumos_directus    → directus.insumos               → alissonerp.insumos
- vw_movimentacoes_directus → directus.*                  → alissonerp.*
- vw_quebra_mensal       → directus.pcp                   → alissonerp.pcp
- vw_quebra_por_deposito → directus.controle_estoque      → alissonerp.movimentacoes_estoque
- vw_quebra_por_ourives  → directus.pcp + users           → alissonerp.pcp + user_profiles
- vw_protocolo_ordens    → directus.*                     → alissonerp.*
- vw_protocolos_completo → directus.protocolo             → alissonerp.protocolos
- vw_apontamentos_ordem  → directus.apontamento           → alissonerp.apontamentos_pcp

Mapeamento de ENUMs:
alissonerp.ordens.situacao: cancelado | criado | rascunho
alissonerp.ordens.status:   aguardando | em_andamento | concluido
alissonerp.ordens.rota:     pcp | protocolo
alissonerp.ordens.tipo_ordem: producao | reparo | ajuste | banho | gravacao | reposicao | outro
alissonerp.pcp.etapas: novas_ordens | pendencia | aguardando | em_andamento | concluido | cancelado
alissonerp.protocolos.etapas: pendente | concluido
alissonerp.protocolos.direcao: ida | volta
alissonerp.distribuicoes.etapas: em_andamento | concluido
alissonerp.distribuicoes.setor: fundicao | aliancas | cnc | laser | banca | tamboreador | epg
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

def run_view(name, sql):
    try:
        cur.execute(f"DROP VIEW IF EXISTS alissonerp.{name} CASCADE")
        cur.execute(sql)
        ok(f"{name}")
    except Exception as e:
        fail(f"{name}: {e}")

section("RECRIANDO VIEWS")

# ── vw_kpis_gerais ─────────────────────────────────────────────────────────
run_view("vw_kpis_gerais", """
CREATE OR REPLACE VIEW alissonerp.vw_kpis_gerais AS
SELECT
    (SELECT count(*) FROM alissonerp.ordens WHERE status = 'em_andamento') AS ordens_em_andamento,
    (SELECT count(*) FROM alissonerp.ordens WHERE status = 'aguardando')   AS ordens_aguardando,
    (SELECT count(*) FROM alissonerp.ordens
     WHERE status = 'concluido' AND created_at > date_trunc('month', now())) AS concluidas_mes,
    (SELECT count(*) FROM alissonerp.pcp
     WHERE etapas IN ('novas_ordens','aguardando','em_andamento'))  AS pcps_ativos,
    (SELECT count(*) FROM alissonerp.protocolos
     WHERE etapas IN ('pendente','concluido'))                      AS protocolos_pendentes,
    (SELECT cotacao_ouro  FROM alissonerp.parametros WHERE id = 1) AS cotacao_ouro,
    (SELECT cotacao_dolar FROM alissonerp.parametros WHERE id = 1) AS cotacao_dolar,
    (SELECT count(*)      FROM alissonerp.contas_pagar   WHERE situacao = 'pendente') AS contas_pagar_pendentes,
    (SELECT COALESCE(sum(valor),0) FROM alissonerp.contas_pagar  WHERE situacao = 'pendente') AS total_a_pagar,
    (SELECT count(*)      FROM alissonerp.contas_receber WHERE situacao = 'pendente') AS contas_receber_pendentes,
    (SELECT COALESCE(sum(valor),0) FROM alissonerp.contas_receber WHERE situacao = 'pendente') AS total_a_receber
""")

# ── vw_producao_mensal ─────────────────────────────────────────────────────
run_view("vw_producao_mensal", """
CREATE OR REPLACE VIEW alissonerp.vw_producao_mensal AS
SELECT
    date_trunc('month', o.created_at)::date AS mes,
    to_char(o.created_at, 'Mon/YY')         AS mes_label,
    count(*)                                 AS total_ordens,
    count(*) FILTER (WHERE o.status = 'concluido')    AS concluidas,
    count(*) FILTER (WHERE o.status = 'em_andamento') AS em_andamento,
    count(*) FILTER (WHERE o.status = 'aguardando')   AS aguardando,
    COALESCE(sum(o.peso_metal_negociado), 0)           AS peso_total_negociado
FROM alissonerp.ordens o
WHERE o.created_at > now() - interval '1 year'
GROUP BY date_trunc('month', o.created_at), to_char(o.created_at, 'Mon/YY')
ORDER BY date_trunc('month', o.created_at)::date DESC
""")

# ── vw_produtividade_ourives ───────────────────────────────────────────────
run_view("vw_produtividade_ourives", """
CREATE OR REPLACE VIEW alissonerp.vw_produtividade_ourives AS
SELECT
    COALESCE(NULLIF(TRIM(up.name), ''), au.email, 'Sem operador') AS operador,
    count(p.id)                          AS total_ordens,
    COALESCE(sum(p.total_metal), 0)      AS total_metal_processado,
    COALESCE(sum(p.pmc), 0)             AS total_pmc,
    COALESCE(avg(p.porcentagem_de_quebra), 0) AS media_quebra,
    COALESCE(sum(p.quebra), 0)          AS total_quebra,
    COALESCE(avg(EXTRACT(epoch FROM (p.data_conclusao - p.created_at)) / 86400.0), 0) AS media_dias_producao
FROM alissonerp.pcp p
LEFT JOIN auth.users au ON au.id = p.operador
LEFT JOIN public.user_profiles up ON up.id_user = au.id
WHERE p.etapas = 'concluido' AND p.total_metal > 0
GROUP BY up.name, au.email
ORDER BY count(p.id) DESC
""")

# ── vw_ordens_por_tipo ─────────────────────────────────────────────────────
run_view("vw_ordens_por_tipo", """
CREATE OR REPLACE VIEW alissonerp.vw_ordens_por_tipo AS
SELECT
    CASE o.tipo_ordem::text
        WHEN 'producao'  THEN 'Producao'
        WHEN 'reparo'    THEN 'Reparo'
        WHEN 'ajuste'    THEN 'Ajuste'
        WHEN 'banho'     THEN 'Banho'
        WHEN 'gravacao'  THEN 'Gravacao'
        WHEN 'reposicao' THEN 'Reposicao'
        WHEN 'outro'     THEN 'Outro'
        ELSE 'N/D'
    END AS tipo,
    count(*) AS total
FROM alissonerp.ordens o
WHERE o.created_at > now() - interval '6 months'
GROUP BY o.tipo_ordem
ORDER BY count(*) DESC
""")

# ── vw_ordens_completa ─────────────────────────────────────────────────────
run_view("vw_ordens_completa", """
CREATE OR REPLACE VIEW alissonerp.vw_ordens_completa AS
SELECT
    o.id,
    o.numero_ordem,
    o.situacao::text                     AS situacao_cod,
    CASE o.situacao::text
        WHEN 'cancelado' THEN 'Cancelado'
        WHEN 'criado'    THEN 'Criado'
        WHEN 'rascunho'  THEN 'Rascunho'
        ELSE 'Desconhecido'
    END AS situacao,
    o.status::text                       AS status_cod,
    CASE o.status::text
        WHEN 'aguardando'   THEN 'Aguardando'
        WHEN 'em_andamento' THEN 'Em Andamento'
        WHEN 'concluido'    THEN 'Concluído'
        ELSE 'Aguardando'
    END AS status,
    o.rota::text                         AS rota_cod,
    CASE o.rota::text
        WHEN 'pcp'       THEN 'PCP'
        WHEN 'protocolo' THEN 'Protocolo'
        ELSE '—'
    END AS rota,
    o.tipo_ordem::text                   AS tipo_ordem_cod,
    CASE o.tipo_ordem::text
        WHEN 'producao'  THEN 'Produção'
        WHEN 'reparo'    THEN 'Reparo'
        WHEN 'ajuste'    THEN 'Ajuste'
        WHEN 'banho'     THEN 'Banho'
        WHEN 'gravacao'  THEN 'Gravação'
        WHEN 'reposicao' THEN 'Reposição'
        WHEN 'outro'     THEN 'Outro'
        ELSE '—'
    END AS tipo_ordem,
    o.setor_atual                        AS setor_id,
    s.nome                               AS setor_nome,
    o.local_atual                        AS deposito_id,
    d.nome                               AS deposito_nome,
    o.vendedor_id,
    v.nome                               AS vendedor_nome,
    o.cliente_id,
    c.nome                               AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at                         AS date_created,
    o.updated_at                         AS date_updated
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s   ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
LEFT JOIN vendedores v            ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c              ON c.id_contato = o.cliente_id
""")

# ── vw_ordem_detalhe ──────────────────────────────────────────────────────
run_view("vw_ordem_detalhe", """
CREATE OR REPLACE VIEW alissonerp.vw_ordem_detalhe AS
SELECT
    o.id,
    o.numero_ordem,
    o.situacao::text                     AS situacao_cod,
    CASE o.situacao::text
        WHEN 'cancelado' THEN 'Cancelado'
        WHEN 'criado'    THEN 'Criado'
        WHEN 'rascunho'  THEN 'Rascunho'
        ELSE 'Desconhecido'
    END AS situacao,
    o.status::text                       AS status_cod,
    CASE o.status::text
        WHEN 'aguardando'   THEN 'Aguardando'
        WHEN 'em_andamento' THEN 'Em Andamento'
        WHEN 'concluido'    THEN 'Concluído'
        ELSE 'Aguardando'
    END AS status,
    o.rota::text                         AS rota_cod,
    CASE o.rota::text
        WHEN 'pcp'       THEN 'PCP'
        WHEN 'protocolo' THEN 'Protocolo'
        ELSE '—'
    END AS rota,
    o.tipo_ordem::text                   AS tipo_ordem_cod,
    CASE o.tipo_ordem::text
        WHEN 'producao'  THEN 'Produção'
        WHEN 'reparo'    THEN 'Reparo'
        WHEN 'ajuste'    THEN 'Ajuste'
        WHEN 'banho'     THEN 'Banho'
        WHEN 'gravacao'  THEN 'Gravação'
        WHEN 'reposicao' THEN 'Reposição'
        WHEN 'outro'     THEN 'Outro'
        ELSE '—'
    END AS tipo_ordem,
    o.setor_atual                        AS setor_id,
    s.nome                               AS setor_nome,
    o.local_atual                        AS deposito_id,
    d.nome                               AS deposito_nome,
    o.vendedor_id,
    v.nome                               AS vendedor_nome,
    o.cliente_id,
    c.nome                               AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at                         AS date_created,
    o.updated_at                         AS date_updated,
    p.id                                 AS pcp_id,
    p.etapas::text                       AS pcp_etapas_cod,
    CASE p.etapas::text
        WHEN 'novas_ordens' THEN 'Novas Ordens'
        WHEN 'pendencia'    THEN 'Pendência'
        WHEN 'aguardando'   THEN 'Aguardando'
        WHEN 'em_andamento' THEN 'Em Andamento'
        WHEN 'concluido'    THEN 'Concluído'
        WHEN 'cancelado'    THEN 'Cancelado'
        ELSE '—'
    END AS pcp_etapas,
    p.total_metal                        AS pcp_total_metal,
    p.retorno_metal                      AS pcp_retorno_metal,
    p.total_pedras_un                    AS pcp_total_pedras_un,
    p.total_pedras_g                     AS pcp_total_pedras_g,
    p.total_geral_outros_pesos           AS pcp_total_outros,
    p.pmc                                AS pcp_pmc,
    p.quebra                             AS pcp_quebra,
    p.porcentagem_de_quebra              AS pcp_quebra_pct,
    p.peso_final                         AS pcp_peso_final,
    p.metal_externo                      AS pcp_metal_externo,
    p.bloqueado                          AS pcp_bloqueado,
    p.data_conclusao                     AS pcp_data_conclusao,
    p.local_atual                        AS pcp_local_atual,
    COALESCE(NULLIF(TRIM(up.name), ''), au.email, 'Sem operador') AS pcp_operador_nome,
    dist.id                              AS dist_id,
    dist.setor::text                     AS dist_setor,
    dist.etapas::text                    AS dist_etapas_cod,
    CASE dist.etapas::text
        WHEN 'em_andamento' THEN 'Em Andamento'
        WHEN 'concluido'    THEN 'Concluído'
        ELSE NULL
    END AS dist_etapas,
    dist.pmc                             AS dist_pmc,
    dist.quebra                          AS dist_quebra,
    dist.porcentagem_de_quebra           AS dist_quebra_pct
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s        ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d      ON d.id = o.local_atual
LEFT JOIN vendedores v                 ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c                   ON c.id_contato = o.cliente_id
LEFT JOIN alissonerp.pcp p             ON p.ordem_id = o.id
LEFT JOIN auth.users au                ON au.id = p.operador
LEFT JOIN public.user_profiles up      ON up.id_user = au.id
LEFT JOIN alissonerp.distribuicoes dist ON dist.id = o.distribuicao_id
""")

# ── vw_transferencias_ordem ────────────────────────────────────────────────
run_view("vw_transferencias_ordem", """
CREATE OR REPLACE VIEW alissonerp.vw_transferencias_ordem AS
SELECT
    t.id,
    t.pcp_id,
    t.ordem_id,
    o.numero_ordem,
    t.created_at                         AS data,
    dep.nome                             AS deposito_nome,
    st.nome                              AS setor_nome,
    COALESCE(NULLIF(TRIM(up.name), ''), au.email, 'Sistema') AS criado_por
FROM alissonerp.transferencias_ordem t
LEFT JOIN alissonerp.ordens o    ON o.id = t.ordem_id
LEFT JOIN alissonerp.depositos dep ON dep.id = t.deposito_id
LEFT JOIN alissonerp.setores st    ON st.id = t.setor_id
LEFT JOIN auth.users au            ON au.id = t.created_by
LEFT JOIN public.user_profiles up  ON up.id_user = au.id
""")

# ── vw_estoque_ordem ──────────────────────────────────────────────────────
run_view("vw_estoque_ordem", """
CREATE OR REPLACE VIEW alissonerp.vw_estoque_ordem AS
SELECT
    m.id,
    m.entrada,
    m.saida,
    m.marcador::text                     AS marcador,
    m.data_hora,
    m.created_at                         AS date_created,
    m.ordem_id,
    o.numero_ordem,
    ins.nome                             AS insumo_nome,
    dep.nome                             AS deposito_nome,
    st.nome                              AS setor_nome
FROM alissonerp.movimentacoes_estoque m
LEFT JOIN alissonerp.ordens o      ON o.id = m.ordem_id
LEFT JOIN alissonerp.insumos ins   ON ins.id = m.insumo_id
LEFT JOIN alissonerp.depositos dep ON dep.id = m.deposito_id
LEFT JOIN alissonerp.setores st    ON st.id = m.setor_id
""")

# ── vw_estoque_directus_saldo (renomear semanticamente — mantém nome) ─────
run_view("vw_estoque_directus_saldo", """
CREATE OR REPLACE VIEW alissonerp.vw_estoque_directus_saldo AS
SELECT
    m.deposito_id,
    dep.nome                             AS deposito_nome,
    m.insumo_id,
    ins.nome                             AS insumo_nome,
    ins.sku                              AS insumo_sku,
    cat.nome                             AS categoria_nome,
    cat.id                               AS categoria_id,
    COALESCE(sum(m.entrada), 0)          AS total_entrada,
    COALESCE(sum(m.saida), 0)            AS total_saida,
    COALESCE(sum(m.entrada), 0) - COALESCE(sum(m.saida), 0) AS saldo,
    count(*)                             AS total_movimentacoes,
    max(m.created_at)                    AS ultima_movimentacao
FROM alissonerp.movimentacoes_estoque m
LEFT JOIN alissonerp.depositos dep  ON dep.id = m.deposito_id
LEFT JOIN alissonerp.insumos ins    ON ins.id = m.insumo_id
LEFT JOIN alissonerp.categorias_insumo cat ON cat.id = ins.categoria_id
GROUP BY m.deposito_id, dep.nome, m.insumo_id, ins.nome, ins.sku, cat.nome, cat.id
""")

# ── vw_insumos_directus ───────────────────────────────────────────────────
run_view("vw_insumos_directus", """
CREATE OR REPLACE VIEW alissonerp.vw_insumos_directus AS
SELECT
    i.id,
    i.sku,
    i.nome,
    cat.nome                             AS categoria,
    cat.id                               AS categoria_id,
    i.saldo,
    i.peso_pedra,
    i.custo_compra,
    i.estoque_minimo,
    i.estoque_maximo,
    CASE
        WHEN i.saldo <= 0                                            THEN 'critico'
        WHEN i.estoque_minimo > 0 AND i.saldo < i.estoque_minimo    THEN 'critico'
        WHEN i.estoque_minimo > 0 AND i.saldo < i.estoque_minimo * 1.5 THEN 'atencao'
        ELSE 'ok'
    END AS status_estoque
FROM alissonerp.insumos i
LEFT JOIN alissonerp.categorias_insumo cat ON cat.id = i.categoria_id
""")

# ── vw_movimentacoes_directus ─────────────────────────────────────────────
run_view("vw_movimentacoes_directus", """
CREATE OR REPLACE VIEW alissonerp.vw_movimentacoes_directus AS
SELECT
    m.id,
    m.entrada,
    m.saida,
    m.insumo_id,
    ins.nome                             AS insumo_nome,
    m.deposito_id,
    dep.nome                             AS deposito_nome,
    m.setor_id                           AS setor,
    st.nome                              AS setor_nome,
    m.marcador::text                     AS marcador,
    m.ordem_id,
    o.numero_ordem,
    m.obs,
    m.data_hora,
    m.created_at                         AS date_created
FROM alissonerp.movimentacoes_estoque m
LEFT JOIN alissonerp.insumos ins   ON ins.id = m.insumo_id
LEFT JOIN alissonerp.depositos dep ON dep.id = m.deposito_id
LEFT JOIN alissonerp.setores st    ON st.id = m.setor_id
LEFT JOIN alissonerp.ordens o      ON o.id = m.ordem_id
""")

# ── vw_quebra_mensal ──────────────────────────────────────────────────────
run_view("vw_quebra_mensal", """
CREATE OR REPLACE VIEW alissonerp.vw_quebra_mensal AS
SELECT
    date_trunc('month', p.data_conclusao) AS mes,
    to_char(p.data_conclusao, 'Mon/YY')   AS mes_label,
    count(p.id)                            AS total_ordens,
    COALESCE(sum(p.total_metal), 0)        AS total_metal,
    COALESCE(sum(p.quebra), 0)             AS total_quebra,
    CASE
        WHEN sum(p.total_metal) > 0
        THEN round((sum(p.quebra)::numeric / NULLIF(sum(p.total_metal),0) * 100)::numeric, 2)
        ELSE 0
    END AS percentual_quebra
FROM alissonerp.pcp p
WHERE p.etapas = 'concluido'
  AND p.data_conclusao IS NOT NULL
  AND p.total_metal > 0
GROUP BY date_trunc('month', p.data_conclusao), to_char(p.data_conclusao, 'Mon/YY')
ORDER BY date_trunc('month', p.data_conclusao) DESC
LIMIT 12
""")

# ── vw_quebra_por_deposito ────────────────────────────────────────────────
run_view("vw_quebra_por_deposito", """
CREATE OR REPLACE VIEW alissonerp.vw_quebra_por_deposito AS
SELECT
    dep.id                               AS deposito_id,
    dep.nome                             AS deposito_nome,
    COALESCE(sum(CASE WHEN m.entrada > 0 THEN m.entrada ELSE 0 END), 0) AS total_entrada,
    COALESCE(sum(CASE WHEN m.saida   > 0 THEN m.saida   ELSE 0 END), 0) AS total_saida,
    COALESCE(sum(COALESCE(m.entrada,0)),0) - COALESCE(sum(COALESCE(m.saida,0)),0) AS saldo
FROM alissonerp.movimentacoes_estoque m
JOIN alissonerp.depositos dep ON dep.id = m.deposito_id
GROUP BY dep.id, dep.nome
ORDER BY saldo DESC
""")

# ── vw_quebra_por_ourives ─────────────────────────────────────────────────
run_view("vw_quebra_por_ourives", """
CREATE OR REPLACE VIEW alissonerp.vw_quebra_por_ourives AS
SELECT
    p.operador                           AS operador_id,
    COALESCE(NULLIF(TRIM(up.name), ''), au.email, 'Sem operador') AS operador_nome,
    count(p.id)                          AS total_ordens,
    COALESCE(sum(p.total_metal), 0)      AS total_metal,
    COALESCE(sum(p.retorno_metal), 0)    AS total_retorno,
    COALESCE(sum(p.pmc), 0)             AS total_pmc,
    COALESCE(sum(p.quebra), 0)          AS total_quebra,
    CASE
        WHEN sum(p.total_metal) > 0
        THEN round((sum(p.quebra)::numeric / NULLIF(sum(p.total_metal),0) * 100)::numeric, 2)
        ELSE 0
    END AS percentual_medio
FROM alissonerp.pcp p
LEFT JOIN auth.users au           ON au.id = p.operador
LEFT JOIN public.user_profiles up ON up.id_user = au.id
WHERE p.etapas = 'concluido' AND p.total_metal > 0
GROUP BY p.operador, up.name, au.email
ORDER BY percentual_medio DESC
""")

# ── vw_protocolo_ordens ───────────────────────────────────────────────────
run_view("vw_protocolo_ordens", """
CREATE OR REPLACE VIEW alissonerp.vw_protocolo_ordens AS
SELECT
    po.id,
    po.protocolo_id,
    po.ordem_id,
    o.numero_ordem,
    o.cliente_id,
    c.nome                               AS cliente_nome,
    o.peso_metal_negociado,
    o.status::text                       AS status,
    CASE o.status::text
        WHEN 'aguardando'   THEN 'Aguardando'
        WHEN 'em_andamento' THEN 'Em Andamento'
        WHEN 'concluido'    THEN 'Concluído'
        ELSE '—'
    END AS status_label
FROM alissonerp.protocolo_ordens po
LEFT JOIN alissonerp.ordens o ON o.id = po.ordem_id
LEFT JOIN contatos c           ON c.id_contato = o.cliente_id
""")

# ── vw_protocolos_completo ────────────────────────────────────────────────
run_view("vw_protocolos_completo", """
CREATE OR REPLACE VIEW alissonerp.vw_protocolos_completo AS
SELECT
    pr.id,
    pr.direcao::text                     AS direcao,
    pr.etapas::text                      AS etapas_cod,
    CASE pr.etapas::text
        WHEN 'pendente'  THEN 'Pendente'
        WHEN 'concluido' THEN 'Concluído'
        ELSE 'Pendente'
    END AS etapas,
    pr.created_at                        AS data_criacao,
    pr.updated_at                        AS data_atualizacao,
    pr.data_conclusao,
    COALESCE(NULLIF(TRIM(up.name), ''), au.email) AS criado_por,
    (SELECT count(*) FROM alissonerp.protocolo_ordens po WHERE po.protocolo_id = pr.id) AS total_ordens
FROM alissonerp.protocolos pr
LEFT JOIN auth.users au           ON au.id = pr.created_by
LEFT JOIN public.user_profiles up ON up.id_user = au.id
""")

# ── vw_apontamentos_ordem ─────────────────────────────────────────────────
run_view("vw_apontamentos_ordem", """
CREATE OR REPLACE VIEW alissonerp.vw_apontamentos_ordem AS
SELECT
    a.id,
    a.pcp_id,
    p.ordem_id,
    o.numero_ordem,
    a.qtd,
    a.created_at                         AS data,
    ta.id                                AS tipo_id,
    ta.descricao                         AS tipo_descricao,
    ins.id                               AS insumo_id,
    ins.nome                             AS insumo_nome,
    ins.sku                              AS insumo_sku,
    cat.nome                             AS insumo_categoria,
    dep.nome                             AS deposito_nome,
    st.nome                              AS setor_nome,
    COALESCE(NULLIF(TRIM(up.name), ''), au.email, 'Sistema') AS criado_por
FROM alissonerp.apontamentos_pcp a
LEFT JOIN alissonerp.pcp p                   ON p.id = a.pcp_id
LEFT JOIN alissonerp.ordens o                ON o.id = p.ordem_id
LEFT JOIN alissonerp.tipos_apontamento ta    ON ta.id = a.tipo_apontamento_id
LEFT JOIN alissonerp.insumos ins             ON ins.id = a.insumo_id
LEFT JOIN alissonerp.categorias_insumo cat   ON cat.id = ins.categoria_id
LEFT JOIN alissonerp.depositos dep           ON dep.id = a.deposito_id
LEFT JOIN alissonerp.setores st              ON st.id = a.setor_id
LEFT JOIN auth.users au                      ON au.id = a.created_by
LEFT JOIN public.user_profiles up            ON up.id_user = au.id
""")

conn.commit()

# ── VALIDAÇÃO ──────────────────────────────────────────────────────────────
section("VALIDAÇÃO RÁPIDA")
views_test = [
    ("vw_kpis_gerais",          "SELECT ordens_em_andamento, concluidas_mes FROM alissonerp.vw_kpis_gerais"),
    ("vw_producao_mensal",      "SELECT count(*) AS n FROM alissonerp.vw_producao_mensal"),
    ("vw_ordens_completa",      "SELECT count(*) AS n FROM alissonerp.vw_ordens_completa"),
    ("vw_pcp_erp",              "SELECT count(*) AS n FROM alissonerp.vw_pcp_erp"),
    ("vw_estoque_directus_saldo","SELECT count(*) AS n FROM alissonerp.vw_estoque_directus_saldo"),
]
for name, sql in views_test:
    try:
        cur.execute(sql)
        r = cur.fetchone()
        ok(f"{name}: {dict(r)}")
    except Exception as e:
        fail(f"{name}: {e}")

# Verificar views que ainda referenciam directus (não deveriam mais)
cur.execute("""
    SELECT viewname
    FROM pg_views
    WHERE schemaname = 'alissonerp'
      AND definition ILIKE '%directus.%'
    ORDER BY viewname
""")
remaining = [r['viewname'] for r in cur.fetchall()]
if remaining:
    info(f"Views ainda com ref directus (OK se são vw_*_directus de compatibilidade): {remaining}")
else:
    ok("Nenhuma view referencia directus!")

conn.close()
print("\n  \033[32mMigração 006 — Views concluída.\033[0m")
