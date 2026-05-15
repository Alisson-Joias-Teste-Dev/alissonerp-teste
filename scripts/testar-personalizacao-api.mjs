/**
 * Teste de API para o sistema de personalização multi-campos
 *
 * Testa o fluxo completo via HTTP:
 * 1. Lista campos configurados para AJ5270
 * 2. Configura 3 campos de personalização
 * 3. Verifica se foram salvos corretamente
 * 4. Testa validações (campos vazios, sem label, produto inexistente)
 *
 * Uso: node scripts/testar-personalizacao-api.mjs
 *
 * Requer: servidor Next.js rodando (npm run dev) e .env.local com credenciais
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

// Carrega service role key do .env.local
const envRaw = readFileSync(envPath, "utf-8");
const serviceRoleKey = envRaw
  .split("\n")
  .find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))
  ?.split("=")
  .slice(1)
  .join("=")
  ?.trim();

if (!serviceRoleKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local");
  process.exit(1);
}

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const PRODUTO_ID = 5270; // AJ5270 - Pingente

let passed = 0;
let failed = 0;

async function api(method, path, body) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${data.error || JSON.stringify(data)}`,
    );
  }

  return data;
}

console.log("\n═══════════════════════════════════════════");
console.log("  TESTE DE API: Personalização Multi-Campos");
console.log(`  Produto: AJ5270 (id=${PRODUTO_ID})`);
console.log(`  Base: ${API_BASE}`);
console.log("═══════════════════════════════════════════\n");

async function run() {
  // ── Teste 1: GET campos (pode estar vazio) ─────────────────
  try {
    const data = await api("GET", `/api/produtos/${PRODUTO_ID}/personalizacao/campos`);
    if (!Array.isArray(data.campos)) {
      throw new Error(`Esperado array "campos", recebeu ${JSON.stringify(data)}`);
    }
    console.log(`  ✅ GET campos — ${data.campos.length} campo(s) encontrado(s)`);
    if (data.campos.length > 0) {
      data.campos.forEach((c, i) => {
        console.log(`       [${i}] label="${c.label}" tipo="${c.tipo}" obrigatorio=${c.obrigatorio} max=${c.max_caracteres}`);
      });
    }
    passed++;
  } catch (e) {
    console.log(`  ❌ GET campos: ${e.message}`);
    failed++;
  }

  // ── Teste 2: POST configurar 3 campos (multi-campos) ────────
  const CAMPOS_TESTE = [
    {
      label: "Nome 1",
      placeholder: "Ex: MARIA",
      exemplo: "MARIA",
      tipo: "nome",
      obrigatorio: true,
      min_caracteres: 2,
      max_caracteres: 30,
      caracteres_permitidos: "alfa_acento_espaco",
    },
    {
      label: "Nome 2",
      placeholder: "Ex: JOAO (opcional)",
      exemplo: "JOAO",
      tipo: "nome",
      obrigatorio: false,
      min_caracteres: 0,
      max_caracteres: 30,
      caracteres_permitidos: "alfa_acento_espaco",
    },
    {
      label: "Nome 3",
      placeholder: "Ex: ANA (opcional)",
      example: "ANA",
      tipo: "nome",
      obrigatorio: false,
      min_caracteres: 0,
      max_caracteres: 20,
      caracteres_permitidos: "alfa_acento_espaco",
    },
  ];

  try {
    const data = await api(
      "POST",
      `/api/produtos/${PRODUTO_ID}/personalizacao/campos`,
      { campos: CAMPOS_TESTE },
    );
    if (data.total !== 3) {
      throw new Error(`Esperado total=3, recebeu ${JSON.stringify(data)}`);
    }
    console.log(`  ✅ POST configurar 3 campos — total=${data.total}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ POST configurar 3 campos: ${e.message}`);
    failed++;
  }

  // ── Teste 3: GET confirmar que salvou ──────────────────────
  try {
    const data = await api("GET", `/api/produtos/${PRODUTO_ID}/personalizacao/campos`);
    if (data.campos.length !== 3) {
      throw new Error(`Esperado 3 campos, encontrado ${data.campos.length}`);
    }
    const c0 = data.campos[0];
    if (c0.label !== "Nome 1") {
      throw new Error(`Esperado label "Nome 1", recebeu "${c0.label}"`);
    }
    if (c0.obrigatorio !== true) {
      throw new Error(`Esperado obrigatorio=true, recebeu ${c0.obrigatorio}`);
    }
    if (Number(c0.max_caracteres) !== 30) {
      throw new Error(`Esperado max_caracteres=30, recebeu ${c0.max_caracteres}`);
    }
    if (!c0.id || !c0.config_id) {
      throw new Error(`Campos id/config_id ausentes`);
    }
    console.log(`  ✅ GET confirmar — 3 campos OK`);
    console.log(`       Campo 0: label="${c0.label}" obrigatorio=${c0.obrigatorio} max=${c0.max_caracteres}`);
    console.log(`       Campo 1: label="${data.campos[1].label}" obrigatorio=${data.campos[1].obrigatorio}`);
    console.log(`       Campo 2: label="${data.campos[2].label}" obrigatorio=${data.campos[2].obrigatorio}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ GET confirmar: ${e.message}`);
    failed++;
  }

  // ── Teste 4: GET para produto sem configuração ─────────────
  try {
    const data = await api("GET", `/api/produtos/999999/personalizacao/campos`);
    if (!Array.isArray(data.campos) || data.campos.length !== 0) {
      throw new Error(`Esperado array vazio, recebeu ${JSON.stringify(data)}`);
    }
    console.log(`  ✅ GET produto sem config — retornou array vazio`);
    passed++;
  } catch (e) {
    console.log(`  ❌ GET produto sem config: ${e.message}`);
    failed++;
  }

  // ── Teste 5: POST com campos inválidos (body vazio) ────────
  try {
    try {
      await api("POST", `/api/produtos/${PRODUTO_ID}/personalizacao/campos`, { campos: [] });
      throw new Error("Deveria ter rejeitado array vazio");
    } catch (e) {
      if (!e.message.includes("Pelo menos 1 campo")) throw e;
    }
    console.log(`  ✅ POST com campos vazios — rejeitado corretamente`);
    passed++;
  } catch (e) {
    console.log(`  ❌ POST com campos vazios: ${e.message}`);
    failed++;
  }

  // ── Teste 6: POST com campo sem label ─────────────────────
  try {
    try {
      await api("POST", `/api/produtos/${PRODUTO_ID}/personalizacao/campos`, {
        campos: [{ max_caracteres: 10 }],
      });
      throw new Error("Deveria ter rejeitado campo sem label");
    } catch (e) {
      if (!e.message.includes("label é obrigatório")) throw e;
    }
    console.log(`  ✅ POST campo sem label — rejeitado corretamente`);
    passed++;
  } catch (e) {
    console.log(`  ❌ POST campo sem label: ${e.message}`);
    failed++;
  }

  // ── Teste 7: POST para produto inexistente ────────────────
  try {
    try {
      await api("POST", `/api/produtos/999999/personalizacao/campos`, {
        campos: [{ label: "Teste", max_caracteres: 10 }],
      });
      throw new Error("Deveria ter rejeitado produto sem config");
    } catch (e) {
      if (!e.message.includes("não possui configuração")) throw e;
    }
    console.log(`  ✅ POST produto sem config — rejeitado corretamente`);
    passed++;
  } catch (e) {
    console.log(`  ❌ POST produto sem config: ${e.message}`);
    failed++;
  }

  // ── Resultado ──────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run();
