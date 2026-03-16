"""
Migration 025: Webhooks n8n + Views Dashboard Avançado
"""
import sys, os, pathlib
sys.stdout.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)

MIGRATION_SQL = """
SET search_path TO alissonerp;

-- ═══ WEBHOOK CONFIG ═══
CREATE TABLE IF NOT EXISTS alissonerp.webhook_config (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(50) UNIQUE NOT NULL,
  url        TEXT NOT NULL,
  ativo      BOOLEAN DEFAULT true,
  descricao  TEXT,
  ultimo_disparo  TIMESTAMPTZ,
  total_disparos  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO alissonerp.webhook_config (nome, url, descricao) VALUES
  ('sync-produtos',        'https://etl.alissonranyel.com.br/webhook/sync-produtos',        'Sync produtos Tiny ERP'),
  ('sync-contatos',        'https://etl.alissonranyel.com.br/webhook/sync-contatos',        'Sync contatos Tiny ERP'),
  ('sync-vendedores',      'https://etl.alissonranyel.com.br/webhook/sync-vendedores',      'Sync vendedores Tiny ERP'),
  ('sync-leads',           'https://etl.alissonranyel.com.br/webhook/sync-leads',           'Sync leads Kommo CRM'),
  ('notificar-ordem',      'https://etl.alissonranyel.com.br/webhook/notificar-ordem',      'WhatsApp cliente nova ordem'),
  ('notificar-protocolo',  'https://etl.alissonranyel.com.br/webhook/notificar-protocolo',  'WhatsApp gerente protocolo'),
  ('notificar-aprovacao',  'https://etl.alissonranyel.com.br/webhook/notificar-aprovacao',  'WhatsApp consultora aprovacao'),
  ('processar-ofx',        'https://etl.alissonranyel.com.br/webhook/processar-ofx',        'Processar extrato OFX'),
  ('sync-pedidos',         'https://etl.alissonranyel.com.br/webhook/sync-pedidos',         'Sync pedidos Tiny ERP')
ON CONFLICT (nome) DO NOTHING;

-- ═══ WEBHOOK LOG ═══
CREATE TABLE IF NOT EXISTS alissonerp.webhook_log (
  id             BIGSERIAL PRIMARY KEY,
  webhook_nome   VARCHAR(50),
  payload        JSONB,
  response_status INTEGER,
  response_body  TEXT,
  erro           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wh_log_nome ON alissonerp.webhook_log(webhook_nome);
CREATE INDEX IF NOT EXISTS idx_wh_log_data ON alissonerp.webhook_log(created_at);

-- ═══ FUNCTION: Registrar disparo de webhook ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_disparar_webhook(
  p_nome VARCHAR, p_payload JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  v_url   TEXT;
  v_ativo BOOLEAN;
BEGIN
  SELECT url, ativo INTO v_url, v_ativo
  FROM alissonerp.webhook_config WHERE nome = p_nome;

  IF v_url IS NULL THEN
    RAISE NOTICE 'Webhook % nao encontrado', p_nome;
    RETURN;
  END IF;

  IF NOT v_ativo THEN
    RAISE NOTICE 'Webhook % inativo', p_nome;
    RETURN;
  END IF;

  INSERT INTO alissonerp.webhook_log (webhook_nome, payload)
  VALUES (p_nome, p_payload);

  UPDATE alissonerp.webhook_config SET
    ultimo_disparo = now(),
    total_disparos = total_disparos + 1
  WHERE nome = p_nome;
END;
$$ LANGUAGE plpgsql;

-- ═══ VIEW: Producao Mensal (ultimos 12 meses) ═══
-- NOTA: coluna correta e peso_metal_negocido (sem 'ia' — typo historico do DB)
CREATE OR REPLACE VIEW alissonerp.vw_producao_mensal AS
SELECT
  DATE_TRUNC('month', o.date_created)::date AS mes,
  TO_CHAR(o.date_created, 'Mon/YY') AS mes_label,
  COUNT(*)                                                              AS total_ordens,
  COUNT(*) FILTER (WHERE o.status = '3')                               AS concluidas,
  COUNT(*) FILTER (WHERE o.status = '2')                               AS em_andamento,
  COUNT(*) FILTER (WHERE o.status = '1')                               AS aguardando,
  COALESCE(SUM(o.peso_metal_negocido), 0)                              AS peso_total_negociado
FROM directus.ordens o
WHERE o.date_created > now() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', o.date_created), TO_CHAR(o.date_created, 'Mon/YY')
ORDER BY mes DESC;

-- ═══ VIEW: Produtividade por Ourives ═══
CREATE OR REPLACE VIEW alissonerp.vw_produtividade_ourives AS
SELECT
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email,
    'Sem operador'
  ) AS operador,
  COUNT(p.id)                                                          AS total_ordens,
  COALESCE(SUM(p.total_metal), 0)                                      AS total_metal_processado,
  COALESCE(SUM(p.pmc), 0)                                              AS total_pmc,
  COALESCE(AVG(p.porcentagem_de_quebra), 0)                            AS media_quebra,
  COALESCE(SUM(p.quebra), 0)                                           AS total_quebra,
  COALESCE(AVG(
    EXTRACT(EPOCH FROM (p.data_conclusao - p.date_created)) / 86400
  ), 0)                                                                AS media_dias_producao
FROM directus.pcp p
LEFT JOIN directus.directus_users du ON p.operador::uuid = du.id
WHERE p.etapas = '5' AND p.total_metal > 0
GROUP BY du.first_name, du.last_name, du.email
ORDER BY total_ordens DESC;

-- ═══ VIEW: KPIs Gerais (snapshot) ═══
CREATE OR REPLACE VIEW alissonerp.vw_kpis_gerais AS
SELECT
  (SELECT COUNT(*) FROM directus.ordens WHERE status = '2')                                   AS ordens_em_andamento,
  (SELECT COUNT(*) FROM directus.ordens WHERE status = '1')                                   AS ordens_aguardando,
  (SELECT COUNT(*) FROM directus.ordens WHERE status = '3'
     AND date_created > DATE_TRUNC('month', now()))                                           AS concluidas_mes,
  (SELECT COUNT(*) FROM directus.pcp WHERE etapas IN ('1','3','4'))                           AS pcps_ativos,
  (SELECT COUNT(*) FROM directus.protocolo WHERE etapas IN ('1','2'))                         AS protocolos_pendentes,
  (SELECT cotacao_ouro  FROM alissonerp.parametros WHERE id = 1)                              AS cotacao_ouro,
  (SELECT cotacao_dolar FROM alissonerp.parametros WHERE id = 1)                              AS cotacao_dolar,
  (SELECT COUNT(*) FROM alissonerp.contas_pagar WHERE situacao = 'pendente')                  AS contas_pagar_pendentes,
  (SELECT COALESCE(SUM(valor), 0) FROM alissonerp.contas_pagar WHERE situacao = 'pendente')   AS total_a_pagar,
  (SELECT COUNT(*) FROM alissonerp.contas_receber WHERE situacao = 'pendente')                AS contas_receber_pendentes,
  (SELECT COALESCE(SUM(valor), 0) FROM alissonerp.contas_receber WHERE situacao = 'pendente') AS total_a_receber;

-- ═══ VIEW: Ordens por Tipo ═══
CREATE OR REPLACE VIEW alissonerp.vw_ordens_por_tipo AS
SELECT
  CASE tipo_ordem
    WHEN '1' THEN 'Producao'
    WHEN '2' THEN 'Reparo'
    WHEN '3' THEN 'Ajuste'
    WHEN '4' THEN 'Banho'
    WHEN '6' THEN 'Gravacao'
    WHEN '7' THEN 'Outro'
    ELSE 'N/D'
  END AS tipo,
  COUNT(*) AS total
FROM directus.ordens
WHERE date_created > now() - INTERVAL '6 months'
GROUP BY tipo_ordem
ORDER BY total DESC;

COMMENT ON TABLE alissonerp.webhook_config IS 'Configuracao dos 9 webhooks n8n. URLs e status.';
COMMENT ON TABLE alissonerp.webhook_log IS 'Log de todos os disparos de webhooks.';
COMMENT ON FUNCTION alissonerp.fn_disparar_webhook IS 'Registra disparo no log + atualiza contador. HTTP feito pelo frontend.';
"""

def ok(msg):   print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("APLICANDO MIGRATION 025")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 025 executada")
except Exception as e:
    fail(f"Migration falhou: {e}")
    import sys; sys.exit(1)

mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "025_webhooks_dashboard.sql"
mig_path.write_text(MIGRATION_SQL, encoding="utf-8")
ok(f"Arquivo salvo em {mig_path}")

section("VERIFICANDO TABELAS")
for tbl in ["webhook_config", "webhook_log"]:
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name=%s", (tbl,))
    if cur.fetchone(): ok(f"tabela {tbl}")
    else: fail(f"tabela {tbl} NAO ENCONTRADA")

section("VERIFICANDO VIEWS")
for vw in ["vw_kpis_gerais", "vw_producao_mensal", "vw_produtividade_ourives", "vw_ordens_por_tipo"]:
    cur.execute("SELECT 1 FROM information_schema.views WHERE table_schema='alissonerp' AND table_name=%s", (vw,))
    if cur.fetchone(): ok(f"view {vw}")
    else: fail(f"view {vw} NAO ENCONTRADA")

section("WEBHOOKS CONFIGURADOS")
cur.execute("SELECT nome, ativo, total_disparos FROM alissonerp.webhook_config ORDER BY nome")
rows = cur.fetchall()
ok(f"{len(rows)} webhooks configurados:")
for r in rows:
    print(f"    {'✓' if r['ativo'] else '✗'}  {r['nome']:30s}  disparos={r['total_disparos']}")

section("KPIs GERAIS")
cur.execute("SELECT * FROM alissonerp.vw_kpis_gerais")
kpi = cur.fetchone()
ok("vw_kpis_gerais:")
for k, v in kpi.items():
    print(f"    {k:35s} = {v}")

section("PRODUCAO MENSAL (ultimos 6 meses)")
cur.execute("SELECT mes_label, total_ordens, concluidas, em_andamento FROM alissonerp.vw_producao_mensal LIMIT 6")
rows = cur.fetchall()
ok(f"vw_producao_mensal: {len(rows)} meses")
for r in rows:
    print(f"    {r['mes_label']:10s}  total={r['total_ordens']:4d}  concluidas={r['concluidas']:4d}  andamento={r['em_andamento']:4d}")

section("ORDENS POR TIPO (6 meses)")
cur.execute("SELECT tipo, total FROM alissonerp.vw_ordens_por_tipo")
rows = cur.fetchall()
ok(f"vw_ordens_por_tipo: {len(rows)} tipos")
for r in rows:
    print(f"    {r['tipo']:12s} = {r['total']}")

section("PRODUTIVIDADE OURIVES (top 5)")
cur.execute("SELECT operador, total_ordens, media_quebra FROM alissonerp.vw_produtividade_ourives LIMIT 5")
rows = cur.fetchall()
ok(f"vw_produtividade_ourives: {len(rows)} ourives com PCPs concluidos")
for r in rows:
    print(f"    {r['operador'][:30]:30s}  ordens={r['total_ordens']}  quebra_media={float(r['media_quebra']):.2f}%")

section("TESTANDO fn_disparar_webhook")
cur.execute("SELECT alissonerp.fn_disparar_webhook('notificar-protocolo', '{\"teste\": true}'::jsonb)")
cur.execute("SELECT total_disparos, ultimo_disparo FROM alissonerp.webhook_config WHERE nome='notificar-protocolo'")
r = cur.fetchone()
ok(f"fn_disparar_webhook: total_disparos={r['total_disparos']}, ultimo_disparo={r['ultimo_disparo']}")
cur.execute("SELECT COUNT(*) AS n FROM alissonerp.webhook_log WHERE webhook_nome='notificar-protocolo'")
n = cur.fetchone()['n']
ok(f"webhook_log: {n} entradas para notificar-protocolo")

# Cleanup
cur.execute("DELETE FROM alissonerp.webhook_log WHERE webhook_nome='notificar-protocolo' AND payload->>'teste' = 'true'")
cur.execute("UPDATE alissonerp.webhook_config SET total_disparos=0, ultimo_disparo=NULL WHERE nome='notificar-protocolo'")
ok("Dados de teste removidos")

print("\n  \033[32mMigration 025 OK — Webhooks + Dashboard Views prontos.\033[0m")
conn.close()
