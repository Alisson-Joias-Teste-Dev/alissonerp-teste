// Smoke test do helper internalError (onda 1C) — sem dependencia de vitest.
// Roda com: node scripts/test-onda-1c.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server.js";

// Reimplementa o helper inline (evita transpilar TS). Mantemos em sync com src/lib/api-error.ts.
function internalError(tag, err, fallback = "Erro interno", status = 500) {
  console.error(tag, err);
  return NextResponse.json({ error: fallback }, { status });
}

test("internalError devolve 500 com mensagem generica por padrao", async () => {
  const originalErr = console.error;
  let logged = null;
  console.error = (...args) => { logged = args; };

  const res = internalError("[TEST]", new Error("relation \"alissonerp.xpto\" does not exist"));

  console.error = originalErr;
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, { error: "Erro interno" });
  assert.equal(logged[0], "[TEST]");
  assert.ok(logged[1] instanceof Error);
});

test("internalError aceita fallback customizado", async () => {
  const originalErr = console.error;
  console.error = () => {};

  const res = internalError("[TEST]", "qualquer coisa", "Erro ao salvar configuracao");

  console.error = originalErr;
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, "Erro ao salvar configuracao");
});

test("internalError nunca vaza err.message ou stack", async () => {
  const originalErr = console.error;
  console.error = () => {};

  const err = new Error("INFO INTERNA: schema=alissonerp, tabela=usuarios, coluna=role");
  err.stack = "STACK: at /home/alisson/projeto/.../route.ts:42";
  const res = internalError("[TEST]", err);

  console.error = originalErr;
  const body = await res.json();
  assert.ok(!JSON.stringify(body).includes("schema=alissonerp"), "vazou err.message");
  assert.ok(!JSON.stringify(body).includes("STACK:"),            "vazou stack trace");
  assert.ok(!JSON.stringify(body).includes("/home/alisson"),     "vazou path interno");
});

test("internalError aceita status customizado (caso raro)", async () => {
  const originalErr = console.error;
  console.error = () => {};

  const res = internalError("[TEST]", new Error("x"), "Bad Gateway", 502);

  console.error = originalErr;
  assert.equal(res.status, 502);
});
