/**
 * Teste de banco para o sistema de personalização multi-campos
 *
 * Acessa o PostgreSQL diretamente para testar:
 * 1. Consultar campos de personalização do AJ5270
 * 2. Inserir/atualizar 3 campos
 * 3. Verificar dados salvos
 * 4. Testar tipos, validações
 *
 * Uso: node scripts/testar-personalizacao-db.mjs
 *
 * Requer: .env.local com DATABASE_URL
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

const envRaw = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não encontrada no .env.local");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  max: 2,
  idle_timeout: 10,
  connect_timeout: 10,
});

const PRODUTO_ID = 5270; // AJ5270

let passed = 0;
let failed = 0;

function test(name, fn) {
  fn()
    .then(() => {
      console.log(`  ✅ ${name}`);
      passed++;
    })
    .catch((e) => {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    });
}

console.log("\n═══════════════════════════════════════════");
console.log("  TESTE DB: Personalização Multi-Campos");
console.log(`  Produto: AJ5270 (id=${PRODUTO_ID})`);
console.log("═══════════════════════════════════════════\n");

async function run() {
  const tests = [];

  // ── Teste 1: Verificar config de personalização existe ────
  tests.push(
    test("Config de personalização existe para AJ5270", async () => {
      const [config] = await sql`
        SELECT id, produto_id, ativo
        FROM alissonerp.produto_personalizacao
        WHERE produto_id = ${PRODUTO_ID} AND ativo = true
      `;
      if (!config) {
        throw new Error(`Produto ${PRODUTO_ID} não tem config de personalização ativa`);
      }
      console.log(`     → config_id=${config.id}, produto_id=${config.produto_id}, ativo=${config.ativo}`);
    })
  );

  // ── Teste 2: Contar campos existentes (antes) ─────────────
  tests.push(
    test("Contar campos existentes antes", async () => {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count
        FROM alissonerp.produto_personalizacao_campos pc
        JOIN alissonerp.produto_personalizacao pp ON pp.id = pc.config_id
        WHERE pp.produto_id = ${PRODUTO_ID} AND pp.ativo = true
      `;
      console.log(`     → ${count} campo(s) encontrado(s) antes da alteração`);
    })
  );

  // ── Teste 3: Deletar campos existentes ────────────────────
  tests.push(
    test("Deletar campos existentes", async () => {
      const [{ config_id }] = await sql`
        SELECT id AS config_id
        FROM alissonerp.produto_personalizacao
        WHERE produto_id = ${PRODUTO_ID} AND ativo = true
        LIMIT 1
      `;
      const result = await sql`
        DELETE FROM alissonerp.produto_personalizacao_campos
        WHERE config_id = ${config_id}
      `;
      console.log(`     → ${result.count} campo(s) removido(s)`);
    })
  );

  // ── Teste 4: Inserir 3 campos ────────────────────────────
  tests.push(
    test("Inserir 3 campos de personalização", async () => {
      const [{ config_id }] = await sql`
        SELECT id AS config_id
        FROM alissonerp.produto_personalizacao
        WHERE produto_id = ${PRODUTO_ID} AND ativo = true
        LIMIT 1
      `;

      const campos = [
        {
          label: "Nome 1",
          tipo: "nome",
          obrigatorio: true,
          min_caracteres: 2,
          max_caracteres: 30,
          caracteres_permitidos: "alfa_acento_espaco",
          placeholder: "Ex: MARIA",
        },
        {
          label: "Nome 2",
          tipo: "nome",
          obrigatorio: false,
          min_caracteres: 0,
          max_caracteres: 30,
          caracteres_permitidos: "alfa_acento_espaco",
          placeholder: "Ex: JOAO (opcional)",
        },
        {
          label: "Nome 3",
          tipo: "nome",
          obrigatorio: false,
          min_caracteres: 0,
          max_caracteres: 20,
          caracteres_permitidos: "alfa_acento_espaco",
          placeholder: "Ex: ANA (opcional)",
        },
      ];

      for (let i = 0; i < campos.length; i++) {
        const c = campos[i];
        await sql`
          INSERT INTO alissonerp.produto_personalizacao_campos (
            config_id, label, placeholder, tipo,
            obrigatorio, min_caracteres, max_caracteres,
            caracteres_permitidos, posicao
          ) VALUES (
            ${config_id},
            ${c.label},
            ${c.placeholder},
            ${c.tipo},
            ${c.obrigatorio},
            ${c.min_caracteres},
            ${c.max_caracteres},
            ${c.caracteres_permitidos},
            ${i}
          )
        `;
      }

      console.log(`     → 3 campos inseridos com config_id=${config_id}`);
    })
  );

  // ── Teste 5: Verificar campos salvos (SELECT) ────────────
  tests.push(
    test("Verificar 3 campos salvos no banco", async () => {
      const campos = await sql`
        SELECT
          pc.id, pc.label, pc.tipo, pc.obrigatorio,
          pc.min_caracteres, pc.max_caracteres,
          pc.caracteres_permitidos, pc.posicao
        FROM alissonerp.produto_personalizacao_campos pc
        JOIN alissonerp.produto_personalizacao pp ON pp.id = pc.config_id
        WHERE pp.produto_id = ${PRODUTO_ID} AND pp.ativo = true
        ORDER BY pc.posicao ASC, pc.id ASC
      `;

      if (campos.length !== 3) {
        throw new Error(`Esperado 3 campos, encontrado ${campos.length}`);
      }

      // Verifica campo 0 (Nome 1, obrigatório)
      const c0 = campos[0];
      if (c0.label !== "Nome 1") throw new Error(`label[0] esperado "Nome 1", recebeu "${c0.label}"`);
      if (c0.obrigatorio !== true) throw new Error(`obrigatorio[0] esperado true, recebeu ${c0.obrigatorio}`);
      if (c0.max_caracteres !== 30) throw new Error(`max_caracteres[0] esperado 30, recebeu ${c0.max_caracteres}`);
      if (c0.min_caracteres !== 2) throw new Error(`min_caracteres[0] esperado 2, recebeu ${c0.min_caracteres}`);

      // Verifica campo 1 (Nome 2, opcional)
      const c1 = campos[1];
      if (c1.label !== "Nome 2") throw new Error(`label[1] esperado "Nome 2", recebeu "${c1.label}"`);
      if (c1.obrigatorio !== false) throw new Error(`obrigatorio[1] esperado false, recebeu ${c1.obrigatorio}`);

      // Verifica campo 2 (Nome 3, opcional, max 20)
      const c2 = campos[2];
      if (c2.label !== "Nome 3") throw new Error(`label[2] esperado "Nome 3", recebeu "${c2.label}"`);
      if (c2.max_caracteres !== 20) throw new Error(`max_caracteres[2] esperado 20, recebeu ${c2.max_caracteres}`);

      console.log(`     → 3 campos verificados:`);
      campos.forEach((c, i) => {
        console.log(`       [${c.posicao}] "${c.label}" tipo=${c.tipo} obrig=${c.obrigatorio} min=${c.min_caracteres} max=${c.max_caracteres} chars=${c.caracteres_permitidos}`);
      });
    })
  );

  // ── Teste 6: Testar tipo alfa_acento_espaco (aceita acentos e espaços) ──
  tests.push(
    test("Campo tipo alfa_acento_espaco — MAIÚSCULAS", async () => {
      const [campo] = await sql`
        SELECT caracteres_permitidos
        FROM alissonerp.produto_personalizacao_campos pc
        JOIN alissonerp.produto_personalizacao pp ON pp.id = pc.config_id
        WHERE pp.produto_id = ${PRODUTO_ID} AND pp.ativo = true
          AND pc.label = 'Nome 1'
        LIMIT 1
      `;
      if (!campo) throw new Error("Campo Nome 1 não encontrado");
      if (campo.caracteres_permitidos !== "alfa_acento_espaco") {
        throw new Error(`Esperado "alfa_acento_espaco", recebeu "${campo.caracteres_permitidos}"`);
      }
    })
  );

  // ── Teste 7: Verificar ordenação por posicao ───────────────
  tests.push(
    test("Campos retornam ordenados por posicao", async () => {
      const campos = await sql`
        SELECT label, posicao
        FROM alissonerp.produto_personalizacao_campos pc
        JOIN alissonerp.produto_personalizacao pp ON pp.id = pc.config_id
        WHERE pp.produto_id = ${PRODUTO_ID} AND pp.ativo = true
        ORDER BY pc.posicao ASC, pc.id ASC
      `;
      const labels = campos.map((c) => c.label);
      const esperado = ["Nome 1", "Nome 2", "Nome 3"];
      if (JSON.stringify(labels) !== JSON.stringify(esperado)) {
        throw new Error(`Ordem esperada ${JSON.stringify(esperado)}, recebeu ${JSON.stringify(labels)}`);
      }
    })
  );

  // ── Executar todos ──────────────────────────────────────
  for (const t of tests) {
    await t;
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════\n");

  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}

run();
