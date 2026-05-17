// Smoke test do helper rate-limit (onda 1H) — sem dependencia de vitest.
// Roda com: node scripts/test-onda-1h.mjs
//
// Cobre a logica de token-bucket + reset por janela. Como o helper esta em TS,
// reimplementamos inline para isolar o teste (mesmo padrao das ondas 1C e 1D).

import test from "node:test";
import assert from "node:assert/strict";

// ── Reimplementacao inline (mantem sincronizado com src/lib/rate-limit.ts) ──
const buckets = new Map();

class RateLimitError extends Error {
  constructor(retryAfter) {
    super("Muitas requisicoes, tente novamente em alguns instantes");
    this.name = "RateLimitError";
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

function rateLimit(key, max, windowMs, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= max) {
    throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  }
  bucket.count++;
}

function getClientIp(headers) {
  const xff = headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers["x-real-ip"];
  if (xri) return String(xri).trim();
  return "unknown";
}

function reset() { buckets.clear(); }

// ── Testes ──────────────────────────────────────────────────────────────────

test("rateLimit: passa nas primeiras N chamadas", () => {
  reset();
  for (let i = 0; i < 3; i++) {
    assert.doesNotThrow(() => rateLimit("k:1", 3, 60_000));
  }
});

test("rateLimit: lanca RateLimitError ao exceder o limite", () => {
  reset();
  for (let i = 0; i < 3; i++) rateLimit("k:2", 3, 60_000);
  assert.throws(
    () => rateLimit("k:2", 3, 60_000),
    (e) => e instanceof RateLimitError && e.status === 429,
  );
});

test("rateLimit: retryAfter eh inteiro positivo em segundos", () => {
  reset();
  const t0 = 1_000_000;
  rateLimit("k:3", 1, 30_000, t0);
  try {
    rateLimit("k:3", 1, 30_000, t0 + 5_000); // 25s restantes
    assert.fail("deveria ter lancado");
  } catch (e) {
    assert.ok(e instanceof RateLimitError);
    assert.equal(e.retryAfter, 25);
  }
});

test("rateLimit: libera apos janela expirar", () => {
  reset();
  const t0 = 2_000_000;
  rateLimit("k:4", 2, 60_000, t0);
  rateLimit("k:4", 2, 60_000, t0 + 100);
  assert.throws(() => rateLimit("k:4", 2, 60_000, t0 + 200));

  // Depois da janela, bucket reseta
  assert.doesNotThrow(() => rateLimit("k:4", 2, 60_000, t0 + 60_001));
  assert.doesNotThrow(() => rateLimit("k:4", 2, 60_000, t0 + 60_002));
  assert.throws(() => rateLimit("k:4", 2, 60_000, t0 + 60_003));
});

test("rateLimit: chaves diferentes nao se afetam", () => {
  reset();
  for (let i = 0; i < 3; i++) rateLimit("user:A", 3, 60_000);
  assert.throws(() => rateLimit("user:A", 3, 60_000));
  // user:B comecou agora — limite cheio disponivel
  assert.doesNotThrow(() => rateLimit("user:B", 3, 60_000));
  assert.doesNotThrow(() => rateLimit("user:B", 3, 60_000));
  assert.doesNotThrow(() => rateLimit("user:B", 3, 60_000));
});

test("rateLimit: dois limites (min + hora) na mesma chamada", () => {
  reset();
  // Simula caso real: limita 3/min E 10/hora para mesma key
  for (let i = 0; i < 3; i++) {
    rateLimit("ia:min:U1", 3, 60_000);
    rateLimit("ia:hour:U1", 10, 60 * 60_000);
  }
  // Quarta chamada estoura o limite por minuto
  assert.throws(() => rateLimit("ia:min:U1", 3, 60_000));
});

test("rateLimit: minimo retryAfter eh 1 segundo", () => {
  reset();
  const t0 = 3_000_000;
  rateLimit("k:5", 1, 500, t0); // janela curta
  try {
    rateLimit("k:5", 1, 500, t0 + 499); // 1ms restante
    assert.fail("deveria ter lancado");
  } catch (e) {
    assert.ok(e.retryAfter >= 1, `retryAfter deveria ser >= 1, foi ${e.retryAfter}`);
  }
});

test("getClientIp: prioriza x-forwarded-for", () => {
  assert.equal(getClientIp({ "x-forwarded-for": "1.2.3.4" }), "1.2.3.4");
});

test("getClientIp: pega primeiro IP de xff multi-hop", () => {
  assert.equal(
    getClientIp({ "x-forwarded-for": "203.0.113.5, 198.51.100.1, 10.0.0.1" }),
    "203.0.113.5",
  );
});

test("getClientIp: trim de espacos", () => {
  assert.equal(
    getClientIp({ "x-forwarded-for": "  192.168.1.10  , 10.0.0.1" }),
    "192.168.1.10",
  );
});

test("getClientIp: fallback x-real-ip", () => {
  assert.equal(getClientIp({ "x-real-ip": "10.0.0.99" }), "10.0.0.99");
});

test("getClientIp: unknown quando nada presente", () => {
  assert.equal(getClientIp({}), "unknown");
});

test("RateLimitError: status 429 fixo", () => {
  const e = new RateLimitError(15);
  assert.equal(e.status, 429);
  assert.equal(e.name, "RateLimitError");
  assert.equal(e.retryAfter, 15);
  assert.match(e.message, /Muitas requisi/);
});
