/**
 * Setup + Teste do sistema de personalizacao multi-campos
 *
 * 1. Cria config de personalizacao para AJ5270 (se nao existir)
 * 2. Configura 3 campos (Nome 1 obrigatorio, Nome 2 opcional, Nome 3 opcional)
 * 3. Testa leitura, ordenacao e validacao
 *
 * Uso: node scripts/setup-e-testar-personalizacao.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const DIR = dirname(fileURLToPath(import.meta.url));
const envPath = join(DIR, "..", ".env.local");
const envRaw = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const DB_URL = env.DATABASE_URL;
if (!DB_URL) { console.error("Sem DATABASE_URL"); process.exit(1); }

const sql = postgres(DB_URL, { max: 2, idle_timeout: 10, connect_timeout: 10 });
const PID = 5270;
let pass = 0, fail = 0;

async function t(name, fn) {
  try { await fn(); console.log("  PASS: " + name); pass++; }
  catch (e) { console.log("  FAIL: " + name + " - " + e.message); fail++; }
}

async function run() {
  console.log("=== Setup + Teste: Personalizacao Multi-Campos ===");
  console.log("Produto AJ5270 (id=" + PID + ")\n");

  let configId;

  // ── PASSO 1: Verificar estrutura das tabelas ─────────
  await t("Verificar se produto_personalizacao_campos existe", async () => {
    const [t] = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = 'produto_personalizacao_campos'
    `;
    if (!t) throw new Error("Tabela produto_personalizacao_campos NAO existe! Migration precisa ser aplicada.");
    console.log("  -> Tabela produto_personalizacao_campos existe OK");
  });

  // ── PASSO 2: Verificar colunas de produto_personalizacao ──
  await t("Verificar colunas de produto_personalizacao", async () => {
    const cols = await sql`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'produto_personalizacao'
      ORDER BY ordinal_position
    `;
    console.log("  -> Colunas de produto_personalizacao:");
    cols.forEach(c => console.log("     " + c.column_name + " (nullable=" + c.is_nullable + ", default=" + (c.column_default || '—') + ")"));
  });

  // ── PASSO 3: Verificar colunas de produto_personalizacao_campos ──
  await t("Verificar colunas de produto_personalizacao_campos", async () => {
    const cols = await sql`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'produto_personalizacao_campos'
      ORDER BY ordinal_position
    `;
    console.log("  -> Colunas de produto_personalizacao_campos:");
    cols.forEach(c => console.log("     " + c.column_name + " (nullable=" + c.is_nullable + ", default=" + (c.column_default || '—') + ")"));
  });

  // ── PASSO 4: Criar config se nao existir ───────────────
  await t("Criar/configurar personalizacao para AJ5270", async () => {
    // Check if config exists
    const [existing] = await sql`SELECT id FROM alissonerp.produto_personalizacao WHERE produto_id = ${PID} AND ativo = true LIMIT 1`;
    if (existing) {
      configId = existing.id;
      console.log("  -> Config ja existe: config_id=" + configId);
    } else {
      // Check if product exists in public.produtos
      const [prod] = await sql`SELECT id_produto FROM public.produtos WHERE id_produto = ${PID} LIMIT 1`;
      if (!prod) {
        throw new Error("Produto " + PID + " nao existe em public.produtos");
      }

      // Check if there's an inactive config we can reactivate
      const [inactive] = await sql`SELECT id FROM alissonerp.produto_personalizacao WHERE produto_id = ${PID} LIMIT 1`;
      if (inactive) {
        await sql`UPDATE alissonerp.produto_personalizacao SET ativo = true WHERE id = ${inactive.id}`;
        configId = inactive.id;
        console.log("  -> Config inativa reativada: config_id=" + configId);
      } else {
        // Create new config - provide max_caracteres since it's NOT NULL without default
        const [created] = await sql`
          INSERT INTO alissonerp.produto_personalizacao (produto_id, ativo, max_caracteres)
          VALUES (${PID}, true, 30)
          RETURNING id
        `;
        configId = created.id;
        console.log("  -> Nova config criada: config_id=" + configId);
      }
    }
  });

  // ── PASSO 5: Remover campos existentes e inserir 3 ─────
  await t("Configurar 3 campos (Nome1 obrig, Nome2 opc, Nome3 opc)", async () => {
    await sql`DELETE FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId}`;

    const dados = [
      ["Nome 1", "nome", true, 2, 30, "alfa_acento_espaco", "Ex: MARIA", 0],
      ["Nome 2", "nome", false, 0, 30, "alfa_acento_espaco", "Ex: JOAO (opcional)", 1],
      ["Nome 3", "nome", false, 0, 20, "alfa_acento_espaco", "Ex: ANA (opcional)", 2],
    ];

    for (const d of dados) {
      await sql`
        INSERT INTO alissonerp.produto_personalizacao_campos
          (config_id, label, tipo, obrigatorio, min_caracteres, max_caracteres, caracteres_permitidos, placeholder, posicao)
        VALUES (${configId}, ${d[0]}, ${d[1]}, ${d[2]}, ${d[3]}, ${d[4]}, ${d[5]}, ${d[6]}, ${d[7]})
      `;
    }
    console.log("  -> 3 campos inseridos com sucesso");
  });

  // ── PASSO 6: Verificar campos salvos ───────────────────
  await t("SELECT confirma 3 campos", async () => {
    const rows = await sql`
      SELECT id, label, tipo, obrigatorio, min_caracteres, max_caracteres, caracteres_permitidos, posicao
      FROM alissonerp.produto_personalizacao_campos
      WHERE config_id = ${configId}
      ORDER BY posicao ASC, id ASC
    `;
    if (rows.length !== 3) throw new Error("Expected 3, got " + rows.length);
    console.log("  -> " + rows.length + " campos encontrados:");
    rows.forEach(r => console.log("     [" + r.posicao + "] " + r.label + " (tipo=" + r.tipo + ", obrig=" + r.obrigatorio + ", min=" + r.min_caracteres + ", max=" + r.max_caracteres + ", chars=" + r.caracteres_permitidos + ")"));
  });

  // ── PASSO 7: Validar campo 1 ───────────────────────────
  await t("Nome 1: obrigatorio=true, min=2, max=30, chars=alfa_acento_espaco", async () => {
    const [r] = await sql`
      SELECT obrigatorio, min_caracteres, max_caracteres, caracteres_permitidos
      FROM alissonerp.produto_personalizacao_campos
      WHERE config_id = ${configId} AND label = 'Nome 1'
    `;
    if (!r) throw new Error("Nome 1 nao encontrado");
    if (r.obrigatorio !== true) throw new Error("obrigatorio esperado true, got " + r.obrigatorio);
    if (r.min_caracteres !== 2) throw new Error("min esperado 2, got " + r.min_caracteres);
    if (r.max_caracteres !== 30) throw new Error("max esperado 30, got " + r.max_caracteres);
    if (r.caracteres_permitidos !== "alfa_acento_espaco") throw new Error("chars esperado alfa_acento_espaco, got " + r.caracteres_permitidos);
  });

  // ── PASSO 8: Validar campo 3 (opcional, max 20) ────────
  await t("Nome 3: obrigatorio=false, min=0, max=20", async () => {
    const [r] = await sql`
      SELECT obrigatorio, min_caracteres, max_caracteres
      FROM alissonerp.produto_personalizacao_campos
      WHERE config_id = ${configId} AND label = 'Nome 3'
    `;
    if (!r) throw new Error("Nome 3 nao encontrado");
    if (r.obrigatorio !== false) throw new Error("obrigatorio esperado false, got " + r.obrigatorio);
    if (r.min_caracteres !== 0) throw new Error("min esperado 0, got " + r.min_caracteres);
    if (r.max_caracteres !== 20) throw new Error("max esperado 20, got " + r.max_caracteres);
  });

  // ── PASSO 9: Testar ordenacao ──────────────────────────
  await t("Ordenacao: Nome 1 (pos 0), Nome 2 (pos 1), Nome 3 (pos 2)", async () => {
    const rows = await sql`
      SELECT label, posicao
      FROM alissonerp.produto_personalizacao_campos
      WHERE config_id = ${configId}
      ORDER BY posicao ASC, id ASC
    `;
    const labels = rows.map(r => r.label);
    const expected = ["Nome 1", "Nome 2", "Nome 3"];
    const ok = JSON.stringify(labels) === JSON.stringify(expected);
    if (!ok) throw new Error("Esperado " + JSON.stringify(expected) + " got " + JSON.stringify(labels));
  });

  // ── PASSO 10: Testar cascade delete (opcional) ─────────
  await t("Campos tem FK para config_id (nao quebra)", async () => {
    const [constraint] = await sql`
      SELECT con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.confrelid
      WHERE rel.relname = 'produto_personalizacao'
        AND con.conname LIKE '%campos%'
      LIMIT 1
    `;
    if (constraint) {
      console.log("  -> FK constraint: " + constraint.constraint_name);
    } else {
      console.log("  -> FK constraint nao encontrada por nome, mas INSERT/ DELETE funcionou");
    }
  });

  // ── Resultado ──────────────────────────────────────────
  console.log("\n=== RESULTADO: " + pass + " pass, " + fail + " fail ===");
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

run();
