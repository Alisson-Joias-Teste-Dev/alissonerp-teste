"""
apply_021_and_test.py — Aplica migration 021 e testa Flows 02, 03, 05, 06 (Protocolo)
"""
import psycopg2, sys, os
sys.stdout.reconfigure(encoding='utf-8')

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor()

def ok(msg):   print(f"  OK  {msg}")
def fail(msg): print(f"  FAIL {msg}"); sys.exit(1)
def q1(sql, p=()): cur.execute(sql, p); return cur.fetchone()
def qall(sql, p=()): cur.execute(sql, p); return cur.fetchall()

# ─── SQL da migration (escrita aqui para evitar dollar-quoting do bash) ─────

MIGRATION_SQL = """
SET search_path TO alissonerp;

-- =============================================
-- MIGRATION 021: TRIGGERS PROTOCOLO (Flows 02, 03, 05, 06)
-- =============================================

-- ═══ PATCH fn_processar_saida_ordem — adicionar guard peso NULL ═══
-- (evita exception ao inserir saida_ordem vazia no Flow 03)
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp    RECORD;
  v_item   RECORD;
  v_pmc    REAL;
  v_quebra REAL;
  v_pct    REAL;
BEGIN
  -- Guard: ignorar inserts sem peso (saidas vazias criadas pelo Flow 03)
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pcp
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC LIMIT 1;

  IF v_pcp.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum PCP ativo encontrado para ordem %', NEW.ordem_id;
  END IF;

  SELECT pmc, quebra, percentual INTO v_pmc, v_quebra, v_pct
  FROM alissonerp.fn_calcular_pmc_pcp(
    NEW.peso,
    COALESCE(v_pcp.total_geral_outros_pesos, 0),
    COALESCE(v_pcp.metal_externo, 0),
    COALESCE(v_pcp.total_metal, 0),
    COALESCE(v_pcp.retorno_metal, 0)
  );

  FOR v_item IN
    SELECT ioi.insumo_id, ioi.peso, ioi.deposito_id, ins.categoria_id
    FROM alissonerp.itens_ordem_insumos ioi
    JOIN alissonerp.insumos ins ON ins.id = ioi.insumo_id
    WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
  LOOP
    IF v_item.categoria_id = 1 THEN
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SM', NEW.ordem_id, 'Saida ordem — saida_id #' || NEW.id::text
      );
    ELSE
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SP', NEW.ordem_id, 'Saida ordem — saida_id #' || NEW.id::text
      );
    END IF;
  END LOOP;

  UPDATE alissonerp.pcp SET
    peso_final            = NEW.peso,
    pmc                   = v_pmc,
    quebra                = v_quebra,
    porcentagem_de_quebra = v_pct,
    saida_ordem_id        = NEW.id,
    etapas                = 'concluido',
    data_conclusao        = now(),
    updated_at            = now()
  WHERE id = v_pcp.id;

  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, data_conclusao)
  VALUES ('concluido', 'saida_pcp', 'pcp', NEW.ordem_id, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ FLOW 03 + 05 — CONCLUIR PROTOCOLO (ida→PCPs / volta→aprovacoes) ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo()
RETURNS TRIGGER AS $$
DECLARE
  v_rec      RECORD;
  v_saida_id INTEGER;
BEGIN
  -- Guard: so ao transicionar para 'concluido'
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;

  IF NEW.direcao = 'ida' THEN
    -- Flow 03: para cada ordem → saida_ordem vazia + PCP + atualiza ordem
    FOR v_rec IN
      SELECT o.id            AS ordem_id,
             COALESCE(o.peso_metal_externo, 0) AS metal_ext
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      -- Saida vazia (trigger em saidas_ordem e no-op pois peso=NULL com o novo guard)
      INSERT INTO alissonerp.saidas_ordem (ordem_id)
      VALUES (v_rec.ordem_id) RETURNING id INTO v_saida_id;

      -- PCP com zeros explicitos para evitar NULL + aritmetica
      INSERT INTO alissonerp.pcp (
        ordem_id, etapas, saida_ordem_id, metal_externo,
        total_metal, retorno_metal, total_pedras_un, total_pedras_g,
        total_geral_outros_pesos, total_outros_pesos_g
      ) VALUES (
        v_rec.ordem_id, 'novas_ordens', v_saida_id, v_rec.metal_ext,
        0, 0, 0, 0, 0, 0
      );

      -- Ordem → em_andamento
      UPDATE alissonerp.ordens
      SET status = 'em_andamento', updated_at = now()
      WHERE id = v_rec.ordem_id;
    END LOOP;

  ELSIF NEW.direcao = 'volta' THEN
    -- Flow 05: para cada ordem → aprovacao_consultora pendente
    FOR v_rec IN
      SELECT o.id AS ordem_id, o.vendedor_id
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      INSERT INTO alissonerp.aprovacoes_consultora (etapas, ordem_id, consultora_id)
      VALUES ('pendente', v_rec.ordem_id, v_rec.vendedor_id);
    END LOOP;
  END IF;

  -- Marcar data de conclusao
  NEW.data_conclusao := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_concluir_protocolo ON alissonerp.protocolos;
CREATE TRIGGER trg_concluir_protocolo
  BEFORE UPDATE ON alissonerp.protocolos
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_protocolo();


-- ═══ FLOW 06 — APROVACAO CONSULTORA → PREPARACAO ENTREGA ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_aprovacao_para_entrega()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: so ao aprovar
  IF NEW.etapas != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'aprovado' THEN RETURN NEW; END IF;

  INSERT INTO alissonerp.preparacoes_entrega (etapas, ordem_id)
  VALUES ('pendente', NEW.ordem_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_aprovacao_entrega ON alissonerp.aprovacoes_consultora;
CREATE TRIGGER trg_aprovacao_entrega
  AFTER UPDATE ON alissonerp.aprovacoes_consultora
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_aprovacao_para_entrega();


-- ═══ FLOW 02 — AUDITORIA APROVADA → CRIAR PCP ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_saida_id INTEGER;
BEGIN
  -- Guard: so ao aprovar (nao em criacao de auditorias normais)
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'aprovado' THEN RETURN NEW; END IF;
  IF NEW.ordem_id IS NULL THEN RETURN NEW; END IF;

  -- Reutilizar saida_ordem existente ou criar nova
  SELECT id INTO v_saida_id
  FROM alissonerp.saidas_ordem
  WHERE ordem_id = NEW.ordem_id
  ORDER BY id DESC LIMIT 1;

  IF v_saida_id IS NULL THEN
    INSERT INTO alissonerp.saidas_ordem (ordem_id)
    VALUES (NEW.ordem_id) RETURNING id INTO v_saida_id;
  END IF;

  -- Criar PCP
  INSERT INTO alissonerp.pcp (
    ordem_id, etapas, saida_ordem_id,
    total_metal, retorno_metal, total_pedras_un, total_pedras_g,
    total_geral_outros_pesos, total_outros_pesos_g, metal_externo
  ) VALUES (
    NEW.ordem_id, 'novas_ordens', v_saida_id,
    0, 0, 0, 0, 0, 0, 0
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_processar_auditoria ON alissonerp.auditorias;
CREATE TRIGGER trg_processar_auditoria
  AFTER UPDATE ON alissonerp.auditorias
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_auditoria();


COMMENT ON FUNCTION alissonerp.fn_concluir_protocolo IS
  'Flows 03+05: ida→cria PCPs em batch (saida_ordem vazia + pcp com zeros). volta→cria aprovacoes_consultora.';
COMMENT ON FUNCTION alissonerp.fn_aprovacao_para_entrega IS
  'Flow 06: aprovacoes_consultora→aprovado dispara INSERT em preparacoes_entrega.';
COMMENT ON FUNCTION alissonerp.fn_processar_auditoria IS
  'Flow 02: auditorias→aprovado cria PCP (reutiliza saida_ordem existente se houver).';
"""

# ─── 1. Aplicar migration ────────────────────────────────────────────────────
print("\n══════ APLICANDO MIGRATION 021 ══════")
cur.execute(MIGRATION_SQL)
ok("Migration 021 executada")

# Salvar o SQL como arquivo de migration
migration_path = os.path.join(os.path.dirname(__file__),
    "..", "supabase", "migrations", "021_triggers_protocolo.sql")
with open(migration_path, "w", encoding="utf-8") as f:
    f.write(MIGRATION_SQL)
ok(f"Arquivo salvo em {migration_path}")

# ─── 2. Verificar objetos ────────────────────────────────────────────────────
print("\n══════ VERIFICANDO OBJETOS ══════")
for fn in ["fn_concluir_protocolo", "fn_aprovacao_para_entrega", "fn_processar_auditoria"]:
    row = q1("""SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='alissonerp' AND p.proname=%s""", (fn,))
    if row: ok(f"fn {fn}")
    else:   fail(f"fn {fn} NAO ENCONTRADA")

for trg in ["trg_concluir_protocolo", "trg_aprovacao_entrega", "trg_processar_auditoria"]:
    row = q1("SELECT tgname FROM pg_trigger WHERE tgname=%s", (trg,))
    if row: ok(f"trigger {trg}")
    else:   fail(f"trigger {trg} NAO ENCONTRADO")

# Verificar patch do fn_processar_saida_ordem (deve conter o guard)
row = q1("""SELECT pg_get_functiondef(p.oid)
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='alissonerp' AND p.proname='fn_processar_saida_ordem'""")
if row and "NEW.peso IS NULL" in row[0]:
    ok("fn_processar_saida_ordem tem guard peso NULL")
else:
    fail("fn_processar_saida_ordem NAO tem guard peso NULL")

# ─── 3. Setup dados de teste ─────────────────────────────────────────────────
print("\n══════ SETUP DADOS DE TESTE ══════")

# Limpar dados anteriores
cur.execute("DELETE FROM alissonerp.pcp WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002'))")
cur.execute("DELETE FROM alissonerp.saidas_ordem WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002'))")
cur.execute("DELETE FROM alissonerp.aprovacoes_consultora WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002'))")
cur.execute("DELETE FROM alissonerp.preparacoes_entrega WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002'))")
cur.execute("DELETE FROM alissonerp.protocolo_ordens WHERE ordem_id IN (SELECT id FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002'))")
cur.execute("DELETE FROM alissonerp.ordens WHERE numero_ordem IN ('PROT-001','PROT-002')")

# Criar 2 ordens de teste
cur.execute("""
    INSERT INTO alissonerp.ordens (numero_ordem, tipo_ordem, situacao, status, rota)
    VALUES ('PROT-001', 'producao', 'criado', 'aguardando', 'protocolo') RETURNING id
""")
ord_a = cur.fetchone()[0]

cur.execute("""
    INSERT INTO alissonerp.ordens
        (numero_ordem, tipo_ordem, situacao, status, rota, peso_metal_externo)
    VALUES ('PROT-002', 'reparo', 'criado', 'aguardando', 'protocolo', 2.5) RETURNING id
""")
ord_b = cur.fetchone()[0]
ok(f"Ordens criadas: PROT-001={ord_a}, PROT-002(metal_ext=2.5)={ord_b}")

# ─── 4. Flow 03 — Protocolo Ida → PCPs ──────────────────────────────────────
print("\n══════ FLOW 03 — PROTOCOLO IDA → PCPs ══════")

cur.execute("INSERT INTO alissonerp.protocolos (direcao, etapas) VALUES ('ida', 'pendente') RETURNING id")
prot_ida = cur.fetchone()[0]
ok(f"Protocolo ida criado: id={prot_ida}")

cur.execute("INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id) VALUES (%s, %s)", (prot_ida, ord_a))
cur.execute("INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id) VALUES (%s, %s)", (prot_ida, ord_b))
ok("Ordens vinculadas ao protocolo")

# Concluir protocolo ida
cur.execute("UPDATE alissonerp.protocolos SET etapas='concluido' WHERE id=%s", (prot_ida,))
ok("Protocolo ida concluido")

# Verificar: 2 PCPs criados
pcps = qall("""
    SELECT p.id, p.ordem_id, p.etapas::text, p.metal_externo, p.saida_ordem_id,
           p.total_metal, o.numero_ordem
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE o.numero_ordem IN ('PROT-001', 'PROT-002')
    ORDER BY p.id
""")
if len(pcps) == 2:
    ok(f"2 PCPs criados automaticamente")
else:
    fail(f"Esperado 2 PCPs, encontrado {len(pcps)}")

for p in pcps:
    print(f"    PCP id={p[0]}, ordem={p[6]}, etapas={p[2]}, metal_ext={p[3]}, saida_id={p[4]}, total_metal={p[5]}")

# Verificar metal_externo na ordem PROT-002
pcp_b = next((p for p in pcps if p[6] == 'PROT-002'), None)
if pcp_b and pcp_b[3] == 2.5:
    ok(f"PROT-002 metal_externo=2.5 correto")
else:
    fail(f"metal_externo esperado=2.5, obtido={pcp_b[3] if pcp_b else 'PCP nao encontrado'}")

# Verificar PCPs com etapas=novas_ordens e zeros iniciais
pcp_a = next((p for p in pcps if p[6] == 'PROT-001'), None)
if pcp_a and str(pcp_a[2]) == 'novas_ordens' and pcp_a[5] == 0.0:
    ok(f"PROT-001 etapas=novas_ordens, total_metal=0.0 (zeros iniciais)")
else:
    fail(f"PCP PROT-001 estado invalido: {pcp_a}")

# Verificar saidas_ordem vazias criadas
saidas = qall("""
    SELECT id, ordem_id, peso FROM alissonerp.saidas_ordem
    WHERE ordem_id IN (%s, %s) ORDER BY id
""", (ord_a, ord_b))
if len(saidas) == 2 and all(s[2] is None or s[2] == 0 for s in saidas):
    ok(f"2 saidas_ordem vazias criadas (peso=NULL)")
else:
    fail(f"saidas_ordem inesperado: {saidas}")

# Verificar ordens→em_andamento
ordens_status = qall("SELECT numero_ordem, status::text FROM alissonerp.ordens WHERE id IN (%s, %s)", (ord_a, ord_b))
if all(o[1] == 'em_andamento' for o in ordens_status):
    ok(f"Ambas ordens → status=em_andamento")
else:
    fail(f"Status das ordens: {ordens_status}")

# Verificar data_conclusao no protocolo
prot_data = q1("SELECT data_conclusao FROM alissonerp.protocolos WHERE id=%s", (prot_ida,))
if prot_data[0] is not None:
    ok(f"protocolo.data_conclusao preenchido: {prot_data[0]}")
else:
    fail("data_conclusao nao preenchido no protocolo ida")

# Verificar que o guard funcionou (nao causou exception com saida vazia)
ok("Guard fn_processar_saida_ordem funcionou (saida vazia nao causou exception)")

# ─── 5. Flow 05 — Protocolo Volta → Aprovações ──────────────────────────────
print("\n══════ FLOW 05 — PROTOCOLO VOLTA → APROVACOES ══════")

cur.execute("INSERT INTO alissonerp.protocolos (direcao, etapas) VALUES ('volta', 'pendente') RETURNING id")
prot_volta = cur.fetchone()[0]
cur.execute("INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id) VALUES (%s, %s)", (prot_volta, ord_a))
ok(f"Protocolo volta={prot_volta} criado com ord_a={ord_a}")

cur.execute("UPDATE alissonerp.protocolos SET etapas='concluido' WHERE id=%s", (prot_volta,))
ok("Protocolo volta concluido")

aprov = q1("""
    SELECT id, etapas::text, ordem_id, consultora_id
    FROM alissonerp.aprovacoes_consultora WHERE ordem_id=%s
""", (ord_a,))
if aprov and aprov[1] == 'pendente':
    ok(f"aprovacao_consultora criada: id={aprov[0]}, etapas={aprov[1]}, consultora_id={aprov[3]}")
else:
    fail(f"aprovacao nao criada ou estado invalido: {aprov}")

# ─── 6. Flow 06 — Aprovar → Preparação Entrega ──────────────────────────────
print("\n══════ FLOW 06 — APROVACAO → PREPARACAO ENTREGA ══════")

cur.execute("UPDATE alissonerp.aprovacoes_consultora SET etapas='aprovado' WHERE ordem_id=%s", (ord_a,))
ok("aprovacao_consultora → aprovado")

prep = q1("""
    SELECT id, etapas::text, ordem_id
    FROM alissonerp.preparacoes_entrega WHERE ordem_id=%s
""", (ord_a,))
if prep and prep[1] == 'pendente':
    ok(f"preparacao_entrega criada: id={prep[0]}, etapas={prep[1]}")
else:
    fail(f"preparacao nao criada: {prep}")

# ─── 7. Flow 02 — Auditoria Aprovada → PCP ──────────────────────────────────
print("\n══════ FLOW 02 — AUDITORIA → PCP ══════")

# Criar uma ordem nova para não conflitar com PCPs existentes
cur.execute("""
    INSERT INTO alissonerp.ordens (numero_ordem, tipo_ordem, situacao, status)
    VALUES ('AUDIT-001', 'reparo', 'criado', 'aguardando') RETURNING id
""")
ord_audit = cur.fetchone()[0]

# Criar auditoria pendente
cur.execute("""
    INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id)
    VALUES ('pendente', 'qualidade', 'pcp', %s) RETURNING id
""", (ord_audit,))
audit_id = cur.fetchone()[0]
ok(f"Auditoria criada: id={audit_id}, situacao=pendente")

n_pcps_antes = q1("SELECT COUNT(*) FROM alissonerp.pcp WHERE ordem_id=%s", (ord_audit,))[0]

cur.execute("UPDATE alissonerp.auditorias SET situacao='aprovado' WHERE id=%s", (audit_id,))
ok("Auditoria → aprovado")

n_pcps_depois = q1("SELECT COUNT(*) FROM alissonerp.pcp WHERE ordem_id=%s", (ord_audit,))[0]
if n_pcps_depois == n_pcps_antes + 1:
    pcp_audit = q1("SELECT id, etapas::text, total_metal FROM alissonerp.pcp WHERE ordem_id=%s ORDER BY id DESC LIMIT 1", (ord_audit,))
    ok(f"PCP criado via auditoria: id={pcp_audit[0]}, etapas={pcp_audit[1]}, total_metal={pcp_audit[2]}")
else:
    fail(f"PCP nao criado via auditoria: {n_pcps_antes}→{n_pcps_depois}")

# Limpar AUDIT-001
cur.execute("DELETE FROM alissonerp.auditorias WHERE id=%s", (audit_id,))
cur.execute("DELETE FROM alissonerp.pcp WHERE ordem_id=%s", (ord_audit,))
cur.execute("DELETE FROM alissonerp.saidas_ordem WHERE ordem_id=%s", (ord_audit,))
cur.execute("DELETE FROM alissonerp.ordens WHERE id=%s", (ord_audit,))

# ─── 8. Resumo ───────────────────────────────────────────────────────────────
print("\n══════ RESUMO ══════")
print(f"  PCPs de PROT: {qall('SELECT id, etapas::text, metal_externo FROM alissonerp.pcp WHERE ordem_id IN (%s,%s)', (ord_a, ord_b))}")
print(f"  Aprovacoes: {qall('SELECT etapas::text, ordem_id FROM alissonerp.aprovacoes_consultora WHERE ordem_id=%s', (ord_a,))}")
print(f"  Preparacoes: {qall('SELECT etapas::text, ordem_id FROM alissonerp.preparacoes_entrega WHERE ordem_id=%s', (ord_a,))}")
print(f"  Protocolo ida data_conclusao: {q1('SELECT data_conclusao FROM alissonerp.protocolos WHERE id=%s', (prot_ida,))[0]}")
print()
print("  Migration 021 OK — Flows 02, 03, 05, 06 validados.")

conn.close()
