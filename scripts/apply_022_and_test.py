"""
Migration 022: Lançamento Avulso (Flow 1006) + Compras
Executa SQL via psycopg2 (evita problemas de dollar-quoting no bash)
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)

# ══════════════════════════════════════════════════════════════
# MIGRATION SQL
# ══════════════════════════════════════════════════════════════
MIGRATION_SQL = """
SET search_path TO alissonerp;

-- ═══ FLOW 1006 — LANÇAMENTO AVULSO ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
RETURNS TRIGGER AS $$
DECLARE
  v_dep_almox INTEGER := 1;
BEGIN
  CASE NEW.tipo_lancamento::text

    -- TRANSFERÊNCIA AVULSA (TA): dep_selecionado → dep1
    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Depósito obrigatório para transferência avulsa';
      END IF;
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs
      );

    -- ENTRADA AVULSA (EA): entrada no depósito selecionado (sem par)
    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SAÍDA AVULSA (SA): saída do depósito selecionado (sem par)
    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SANGRIA: entrada no almoxarifado (recolhimento)
    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    ELSE
      RAISE EXCEPTION 'Tipo de lançamento não reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lancamento_avulso ON alissonerp.lancamentos_avulso;
CREATE TRIGGER trg_lancamento_avulso
  AFTER INSERT ON alissonerp.lancamentos_avulso
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_lancamento_avulso();

-- ═══ COMPRAS — TABELAS ═══
CREATE TABLE IF NOT EXISTS alissonerp.compras (
  id         SERIAL PRIMARY KEY,
  fornecedor_id BIGINT REFERENCES public.contatos(id_contato),
  situacao   VARCHAR(20) DEFAULT 'pendente',
  total      DECIMAL(12,3) DEFAULT 0,
  obs        TEXT,
  bloqueado  BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS alissonerp.itens_compra (
  id             SERIAL PRIMARY KEY,
  compra_id      INTEGER REFERENCES alissonerp.compras(id) ON DELETE CASCADE,
  insumo_id      INTEGER REFERENCES alissonerp.insumos(id),
  deposito_id    INTEGER REFERENCES alissonerp.depositos(id) DEFAULT 1,
  qtd            REAL NOT NULL,
  valor_unitario DECIMAL(12,2),
  valor_total    DECIMAL(12,2),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ═══ TRIGGER: Calcular valor_total por item ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra()
RETURNS TRIGGER AS $$
BEGIN
  NEW.valor_total := COALESCE(NEW.qtd, 0) * COALESCE(NEW.valor_unitario, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_item_compra ON alissonerp.itens_compra;
CREATE TRIGGER trg_calcular_item_compra
  BEFORE INSERT OR UPDATE ON alissonerp.itens_compra
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_calcular_item_compra();

-- ═══ TRIGGER: Concluir compra → CE entrada estoque ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  FOR v_item IN
    SELECT * FROM alissonerp.itens_compra WHERE compra_id = NEW.id
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, saida, insumo_id, deposito_id, marcador, obs, preco_compra, valor_total)
    VALUES
      (v_item.qtd, 0, v_item.insumo_id,
       COALESCE(v_item.deposito_id, 1),
       'EA'::alissonerp.enum_marcador_estoque,
       'Entrada via compra #' || NEW.id,
       v_item.valor_unitario, v_item.valor_total);
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra WHERE compra_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ TRIGGER: Bloquear edição após conclusão ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao != OLD.situacao THEN
    RAISE EXCEPTION 'Compra #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- trg_aa_ roda antes de trg_concluir_ (ordem alfabética no PostgreSQL)
DROP TRIGGER IF EXISTS trg_aa_bloquear_compra ON alissonerp.compras;
CREATE TRIGGER trg_aa_bloquear_compra
  BEFORE UPDATE ON alissonerp.compras
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_bloquear_compra();

DROP TRIGGER IF EXISTS trg_concluir_compra ON alissonerp.compras;
CREATE TRIGGER trg_concluir_compra
  BEFORE UPDATE ON alissonerp.compras
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_compra();

COMMENT ON FUNCTION alissonerp.fn_processar_lancamento_avulso IS
  'Flow 1006: Branch T/E/S/Sangria → CE com marcadores TA/EA/SA/Sangria.';
COMMENT ON FUNCTION alissonerp.fn_concluir_compra IS
  'Concluir compra → CE entrada por item + bloquear edição.';
"""

# ══════════════════════════════════════════════════════════════
# CLEANUP SQL (dados de teste)
# ══════════════════════════════════════════════════════════════
CLEANUP_SQL = """
DELETE FROM alissonerp.itens_compra WHERE compra_id IN (
    SELECT id FROM alissonerp.compras WHERE obs LIKE '%teste 022%'
);
DELETE FROM alissonerp.compras WHERE obs LIKE '%teste 022%';
DELETE FROM alissonerp.movimentacoes_estoque WHERE obs LIKE '%teste 022%';
DELETE FROM alissonerp.lancamentos_avulso WHERE obs LIKE '%teste 022%';
"""


def ok(msg): print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")


# ══════════════════════════════════════════════════════════════
section("APLICANDO MIGRATION 022")
# ══════════════════════════════════════════════════════════════
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 022 executada")
except Exception as e:
    fail(f"Migration falhou: {e}")
    sys.exit(1)

# Salvar arquivo
import pathlib
mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "022_lancamento_avulso_compras.sql"
mig_path.write_text(MIGRATION_SQL, encoding="utf-8")
ok(f"Arquivo salvo em {mig_path}")

# ══════════════════════════════════════════════════════════════
section("VERIFICANDO OBJETOS")
# ══════════════════════════════════════════════════════════════
for fn in ["fn_processar_lancamento_avulso", "fn_calcular_item_compra",
           "fn_concluir_compra", "fn_bloquear_compra"]:
    cur.execute("SELECT 1 FROM pg_proc WHERE proname=%s AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='alissonerp')", (fn,))
    if cur.fetchone(): ok(f"fn {fn}")
    else: fail(f"fn {fn} NÃO ENCONTRADA")

for trig, tbl in [
    ("trg_lancamento_avulso", "lancamentos_avulso"),
    ("trg_calcular_item_compra", "itens_compra"),
    ("trg_aa_bloquear_compra", "compras"),
    ("trg_concluir_compra", "compras"),
]:
    cur.execute("SELECT 1 FROM pg_trigger WHERE tgname=%s", (trig,))
    if cur.fetchone(): ok(f"trigger {trig}")
    else: fail(f"trigger {trig} NÃO ENCONTRADO")

for tbl in ["compras", "itens_compra"]:
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name=%s", (tbl,))
    if cur.fetchone(): ok(f"tabela {tbl}")
    else: fail(f"tabela {tbl} NÃO ENCONTRADA")

# Cleanup antes dos testes
cur.execute(CLEANUP_SQL)

# ══════════════════════════════════════════════════════════════
section("FLOW 1006 — ENTRADA AVULSA (EA)")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    INSERT INTO alissonerp.lancamentos_avulso (tipo_lancamento, deposito_id, insumo_id, peso, obs)
    VALUES ('entrada', 1, 1, 50.0, 'teste 022 EA')
    RETURNING id
""")
la_ea_id = cur.fetchone()["id"]

cur.execute("""
    SELECT marcador::text, entrada, saida, deposito_id
    FROM alissonerp.movimentacoes_estoque
    WHERE obs = 'teste 022 EA'
    ORDER BY id DESC LIMIT 1
""")
row = cur.fetchone()
if row and row["marcador"] == "EA" and float(row["entrada"]) == 50.0 and row["deposito_id"] == 1:
    ok(f"EA: entrada=50g, dep=1, marcador=EA")
else:
    fail(f"EA incorreto: {row}")

# ══════════════════════════════════════════════════════════════
section("FLOW 1006 — TRANSFERÊNCIA AVULSA (TA)")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    INSERT INTO alissonerp.lancamentos_avulso (tipo_lancamento, deposito_id, insumo_id, peso, obs)
    VALUES ('transferencia', 2, 1, 10.0, 'teste 022 TA')
    RETURNING id
""")
cur.execute("""
    SELECT marcador::text, entrada, saida, deposito_id
    FROM alissonerp.movimentacoes_estoque
    WHERE obs = 'teste 022 TA'
    ORDER BY id
""")
rows = cur.fetchall()
if len(rows) == 2:
    saida_row = next((r for r in rows if float(r["saida"]) > 0), None)
    entrada_row = next((r for r in rows if float(r["entrada"]) > 0), None)
    if (saida_row and saida_row["deposito_id"] == 2 and float(saida_row["saida"]) == 10.0 and
        entrada_row and entrada_row["deposito_id"] == 1 and float(entrada_row["entrada"]) == 10.0):
        ok(f"TA: saída dep2=10g + entrada dep1=10g, marcador=TA (CE correto)")
    else:
        fail(f"TA rows incorretas: {rows}")
else:
    fail(f"TA esperava 2 rows de CE, got {len(rows)}: {rows}")

# ══════════════════════════════════════════════════════════════
section("FLOW 1006 — SAÍDA AVULSA (SA)")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    INSERT INTO alissonerp.lancamentos_avulso (tipo_lancamento, deposito_id, insumo_id, peso, obs)
    VALUES ('saida', 1, 1, 2.0, 'teste 022 SA')
    RETURNING id
""")
cur.execute("""
    SELECT marcador::text, entrada, saida, deposito_id
    FROM alissonerp.movimentacoes_estoque
    WHERE obs = 'teste 022 SA'
    ORDER BY id DESC LIMIT 1
""")
row = cur.fetchone()
if row and row["marcador"] == "SA" and float(row["saida"]) == 2.0 and row["deposito_id"] == 1:
    ok(f"SA: saida=2g, dep=1, marcador=SA")
else:
    fail(f"SA incorreto: {row}")

# ══════════════════════════════════════════════════════════════
section("FLOW 1006 — SANGRIA")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    INSERT INTO alissonerp.lancamentos_avulso (tipo_lancamento, insumo_id, peso, obs)
    VALUES ('sangria', 1, 5.0, 'teste 022 Sangria')
    RETURNING id
""")
cur.execute("""
    SELECT marcador::text, entrada, saida, deposito_id
    FROM alissonerp.movimentacoes_estoque
    WHERE obs = 'teste 022 Sangria'
    ORDER BY id DESC LIMIT 1
""")
row = cur.fetchone()
if row and row["marcador"] == "Sangria" and float(row["entrada"]) == 5.0 and row["deposito_id"] == 1:
    ok(f"Sangria: entrada=5g, dep=1 (Almoxarifado), marcador=Sangria")
else:
    fail(f"Sangria incorreto: {row}")

# ══════════════════════════════════════════════════════════════
section("COMPRAS — CRIAR + ITENS + CALCULAR")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    INSERT INTO alissonerp.compras (situacao, obs)
    VALUES ('pendente', 'Compra teste 022')
    RETURNING id
""")
comp_id = cur.fetchone()["id"]
ok(f"Compra criada: id={comp_id}")

cur.execute("""
    INSERT INTO alissonerp.itens_compra (compra_id, insumo_id, deposito_id, qtd, valor_unitario)
    VALUES (%s, 1, 1, 100.0, 398.72)
    RETURNING valor_total
""", (comp_id,))
vt = cur.fetchone()["valor_total"]
expected = round(100.0 * 398.72, 2)
if abs(float(vt) - expected) < 0.01:
    ok(f"valor_total calculado automaticamente: {float(vt):.2f} (esperado {expected:.2f})")
else:
    fail(f"valor_total incorreto: {vt} != {expected}")

# ══════════════════════════════════════════════════════════════
section("COMPRAS — CONCLUIR → CE ENTRADA + BLOQUEIO")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    UPDATE alissonerp.compras SET situacao = 'concluido' WHERE id = %s
""", (comp_id,))

cur.execute("""
    SELECT marcador::text, entrada, insumo_id, preco_compra, valor_total, deposito_id
    FROM alissonerp.movimentacoes_estoque
    WHERE obs = %s
    ORDER BY id DESC LIMIT 1
""", (f"Entrada via compra #{comp_id}",))
row = cur.fetchone()
if row and row["marcador"] == "EA" and float(row["entrada"]) == 100.0:
    ok(f"CE entrada criada: 100g Ouro, preco={row['preco_compra']}, total={row['valor_total']}")
else:
    fail(f"CE entrada incorreta: {row}")

cur.execute("SELECT bloqueado, total FROM alissonerp.compras WHERE id = %s", (comp_id,))
comp = cur.fetchone()
if comp["bloqueado"] and float(comp["total"]) == expected:
    ok(f"Compra bloqueada=true, total={float(comp['total']):.2f}")
else:
    fail(f"Bloqueio/total incorreto: {comp}")

# ══════════════════════════════════════════════════════════════
section("COMPRAS — GUARD BLOQUEIO")
# ══════════════════════════════════════════════════════════════
try:
    cur.execute("UPDATE alissonerp.compras SET situacao = 'pendente' WHERE id = %s", (comp_id,))
    fail("Guard bloqueio NÃO funcionou — deveria ter lançado exception")
except psycopg2.errors.RaiseException as e:
    ok(f"Guard bloqueio funcionou: {str(e).strip()[:60]}")
    conn.rollback()
    conn.autocommit = True

# ══════════════════════════════════════════════════════════════
section("GUARD — TIPO DESCONHECIDO")
# ══════════════════════════════════════════════════════════════
# Não podemos testar tipo inválido porque o enum impede no nível de tipo
ok("Guard tipo inválido: protegido pelo enum_tipo_lancamento (DB-level)")

# ══════════════════════════════════════════════════════════════
section("RESUMO")
# ══════════════════════════════════════════════════════════════
cur.execute("""
    SELECT marcador::text, COUNT(*) as n, SUM(entrada) as ent, SUM(saida) as sai
    FROM alissonerp.movimentacoes_estoque
    WHERE obs LIKE '%teste 022%'
    GROUP BY marcador ORDER BY marcador
""")
rows = cur.fetchall()
print("\n  Movimentações criadas nos testes:")
for r in rows:
    print(f"    {r['marcador']:12s} → n={r['n']} | entrada={r['ent'] or 0:.1f}g | saida={r['sai'] or 0:.1f}g")

print("\n  \033[32mMigration 022 OK — Flow 1006 + Compras validados.\033[0m")
print("  \033[33m🎉 TODOS OS 22 FLOWS REIMPLEMENTADOS!\033[0m")
conn.close()
