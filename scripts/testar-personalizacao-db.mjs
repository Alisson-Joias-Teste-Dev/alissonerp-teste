/**
 * Teste de banco para o sistema de personalizao multi-campos
 * Acessa o PostgreSQL diretamente para testar salvar/ler campos.
 *
 * Uso: node scripts/testar-personalizacao-db.mjs
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
  console.log("=== Teste DB: Personalizacao Multi-Campos ===");
  console.log("Produto AJ5270 (id=" + PID + ")\n");

  // 1. Config existe
  await t("Config de personalizacao existe", async () => {
    const [cfg] = await sql`SELECT id, ativo FROM alissonerp.produto_personalizacao WHERE produto_id = ${PID} AND ativo = true LIMIT 1`;
    if (!cfg) throw new Error("Produto " + PID + " sem config de personalizacao ativa");
    console.log("  -> config_id=" + cfg.id + " ativo=" + cfg.ativo);
  });

  // 2. Contar campos atuais
  let configId;
  await t("Contar campos existentes", async () => {
    const [cfg] = await sql`SELECT id FROM alissonerp.produto_personalizacao WHERE produto_id = ${PID} AND ativo = true LIMIT 1`;
    configId = cfg.id;
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId}`;
    console.log("  -> " + count + " campo(s) existente(s)");
  });

  // 3. Remover e inserir 3 campos
  await t("Resetar + inserir 3 campos (Nome1, Nome2, Nome3)", async () => {
    await sql`DELETE FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId}`;
    const dados = [
      ["Nome 1", "nome", true, 2, 30, "alfa_acento_espaco", 0],
      ["Nome 2", "nome", false, 0, 30, "alfa_acento_espaco", 1],
      ["Nome 3", "nome", false, 0, 20, "alfa_acento_espaco", 2],
    ];
    for (const d of dados) {
      await sql`INSERT INTO alissonerp.produto_personalizacao_campos (config_id, label, tipo, obrigatorio, min_caracteres, max_caracteres, caracteres_permitidos, posicao) VALUES (${configId}, ${d[0]}, ${d[1]}, ${d[2]}, ${d[3]}, ${d[4]}, ${d[5]}, ${d[6]})`;
    }
    console.log("  -> 3 campos inseridos");
  });

  // 4. Verificar quantidade
  await t("SELECT confirma 3 campos", async () => {
    const rows = await sql`SELECT label, obrigatorio, max_caracteres, posicao FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId} ORDER BY posicao ASC`;
    if (rows.length !== 3) throw new Error("Expected 3, got " + rows.length);
    console.log("  -> " + rows.map(r => r.label).join(", "));
  });

  // 5. Validar dados do campo 1 (Nome 1 - obrigatorio)
  await t("Campo Nome 1: obrigatorio=true, max=30", async () => {
    const [r] = await sql`SELECT obrigatorio, max_caracteres FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId} AND label = 'Nome 1'`;
    if (!r) throw new Error("Nome 1 nao encontrado");
    if (r.obrigatorio !== true) throw new Error("obrigatorio esperado true, got " + r.obrigatorio);
    if (r.max_caracteres !== 30) throw new Error("max esperado 30, got " + r.max_caracteres);
  });

  // 6. Campo 3 opcional com max 20
  await t("Campo Nome 3: obrigatorio=false, max=20", async () => {
    const [r] = await sql`SELECT obrigatorio, max_caracteres FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId} AND label = 'Nome 3'`;
    if (!r) throw new Error("Nome 3 nao encontrado");
    if (r.obrigatorio !== false) throw new Error("obrigatorio esperado false, got " + r.obrigatorio);
    if (r.max_caracteres !== 20) throw new Error("max esperado 20, got " + r.max_caracteres);
  });

  // 7. Ordenacao
  await t("Ordenacao por posicao: Nome1, Nome2, Nome3", async () => {
    const labels = (await sql`SELECT label FROM alissonerp.produto_personalizacao_campos WHERE config_id = ${configId} ORDER BY posicao ASC, id ASC`).map(r => r.label);
    const expected = ["Nome 1", "Nome 2", "Nome 3"];
    const ok = JSON.stringify(labels) === JSON.stringify(expected);
    if (!ok) throw new Error("Esperado " + JSON.stringify(expected) + " got " + JSON.stringify(labels));
  });

  console.log("\n=== RESULTADO: " + pass + " pass, " + fail + " fail ===");
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}
run();
