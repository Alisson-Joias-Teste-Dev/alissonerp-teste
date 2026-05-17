// Smoke test do helper payload-limits (onda 1I) — sem dependencia de vitest.
// Roda com: node scripts/test-onda-1i.mjs
//
// Cobre as 3 funcoes (checkStringLength, checkArrayLength, checkBase64Length)
// e a classe PayloadTooLargeError. Reimplementacao inline para isolar o teste
// (mesmo padrao das ondas 1C, 1D e 1H).

import test from "node:test";
import assert from "node:assert/strict";

// ── Reimplementacao inline (mantem sincronizado com src/lib/payload-limits.ts) ──
class PayloadTooLargeError extends Error {
  constructor(field, max, actual) {
    super(`Campo "${field}" excede limite (${actual} > ${max})`);
    this.name = "PayloadTooLargeError";
    this.status = 413;
    this.field = field;
    this.max = max;
    this.actual = actual;
  }
}

function checkStringLength(field, value, max) {
  if (typeof value !== "string") return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}

function checkArrayLength(field, value, max) {
  if (!Array.isArray(value)) return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}

function checkBase64Length(field, value, max) {
  if (typeof value !== "string") return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}

// ── Testes ──────────────────────────────────────────────────────────────────

test("checkStringLength: passa quando dentro do limite", () => {
  assert.doesNotThrow(() => checkStringLength("obs", "ok", 100));
  assert.doesNotThrow(() => checkStringLength("obs", "a".repeat(100), 100));
});

test("checkStringLength: lanca 413 quando excede", () => {
  assert.throws(
    () => checkStringLength("obs", "a".repeat(101), 100),
    (e) => e instanceof PayloadTooLargeError && e.status === 413,
  );
});

test("checkStringLength: ignora valores nao-string (null, undefined, number, array)", () => {
  assert.doesNotThrow(() => checkStringLength("obs", null, 5));
  assert.doesNotThrow(() => checkStringLength("obs", undefined, 5));
  assert.doesNotThrow(() => checkStringLength("obs", 9999999, 5));
  assert.doesNotThrow(() => checkStringLength("obs", ["a", "b"], 5));
  assert.doesNotThrow(() => checkStringLength("obs", { x: 1 }, 5));
});

test("checkStringLength: string vazia passa (0 <= max)", () => {
  assert.doesNotThrow(() => checkStringLength("obs", "", 100));
  assert.doesNotThrow(() => checkStringLength("obs", "", 0));
});

test("checkArrayLength: passa quando dentro do limite", () => {
  assert.doesNotThrow(() => checkArrayLength("itens", [1, 2, 3], 10));
  assert.doesNotThrow(() => checkArrayLength("itens", new Array(10).fill(0), 10));
});

test("checkArrayLength: lanca 413 quando excede", () => {
  assert.throws(
    () => checkArrayLength("itens", new Array(11).fill(0), 10),
    (e) => e instanceof PayloadTooLargeError && e.status === 413,
  );
});

test("checkArrayLength: ignora valores nao-array", () => {
  assert.doesNotThrow(() => checkArrayLength("itens", null, 1));
  assert.doesNotThrow(() => checkArrayLength("itens", undefined, 1));
  assert.doesNotThrow(() => checkArrayLength("itens", "abcde", 1));
  assert.doesNotThrow(() => checkArrayLength("itens", { length: 999 }, 1));
});

test("checkArrayLength: array vazio passa", () => {
  assert.doesNotThrow(() => checkArrayLength("itens", [], 100));
  assert.doesNotThrow(() => checkArrayLength("itens", [], 0));
});

test("checkBase64Length: passa quando dentro do limite", () => {
  assert.doesNotThrow(() => checkBase64Length("foto", "a".repeat(1000), 5_000));
});

test("checkBase64Length: lanca 413 quando excede (simulando ~3.75MB binario)", () => {
  // 5_000_000 chars base64 = ~3.75MB binario; testamos com 5_000_001 chars
  const big = "a".repeat(5_000_001);
  assert.throws(
    () => checkBase64Length("foto", big, 5_000_000),
    (e) => e instanceof PayloadTooLargeError && e.field === "foto" && e.status === 413,
  );
});

test("checkBase64Length: ignora nao-string", () => {
  assert.doesNotThrow(() => checkBase64Length("foto", Buffer.from("x"), 5));
  assert.doesNotThrow(() => checkBase64Length("foto", null, 5));
});

test("PayloadTooLargeError: status 413 fixo + props expostas", () => {
  const e = new PayloadTooLargeError("itens", 100, 150);
  assert.equal(e.status, 413);
  assert.equal(e.name, "PayloadTooLargeError");
  assert.equal(e.field, "itens");
  assert.equal(e.max, 100);
  assert.equal(e.actual, 150);
  assert.match(e.message, /itens.*150.*100/);
});

test("uso combinado: campos diferentes em sequencia", () => {
  const body = {
    observacoes: "tudo certo",
    itens: [1, 2, 3],
    foto: "data:image/jpeg;base64,/9j/...",
  };
  assert.doesNotThrow(() => {
    checkStringLength("observacoes", body.observacoes, 5_000);
    checkArrayLength("itens", body.itens, 100);
    checkBase64Length("foto", body.foto, 5_000_000);
  });
});

test("uso combinado: primeiro check que estourar interrompe", () => {
  const body = {
    observacoes: "a".repeat(10_000),
    itens: new Array(500).fill(0),
  };
  let qualEstourou = null;
  try {
    checkStringLength("observacoes", body.observacoes, 5_000);
    checkArrayLength("itens", body.itens, 100);
  } catch (e) {
    qualEstourou = e.field;
  }
  // observacoes eh checado primeiro — deve ser ele que estoura
  assert.equal(qualEstourou, "observacoes");
});

test("array de objetos: checa nome de cada item dentro do loop", () => {
  const body = {
    itens: [
      { nome_produto: "ok" },
      { nome_produto: "a".repeat(300) },
    ],
  };
  let estourou = null;
  try {
    for (const item of body.itens) {
      checkStringLength("itens[].nome_produto", item.nome_produto, 200);
    }
  } catch (e) {
    estourou = e;
  }
  assert.ok(estourou instanceof PayloadTooLargeError);
  assert.equal(estourou.field, "itens[].nome_produto");
  assert.equal(estourou.actual, 300);
});
