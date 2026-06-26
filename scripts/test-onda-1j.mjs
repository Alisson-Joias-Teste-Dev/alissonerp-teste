// Smoke test dos schemas zod comuns (onda 1J) — sem dependencia de vitest.
// Roda com: node scripts/test-onda-1j.mjs
//
// Cobre os schemas reutilizaveis de src/lib/schemas/common.ts.
// Reimplementacao inline para isolar o teste (mesmo padrao das ondas 1C/1D/1H/1I).

import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// ── Reimplementacao inline (mantem sincronizado com src/lib/schemas/common.ts) ──
const IdSchema = z.coerce.number().int().positive();
const UuidSchema = z.string().uuid();
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const MoneySchema = z.number().nonnegative();
const WeightSchema = z.number().nonnegative();
const PercentSchema = z.number().min(0).max(100);
const QuantitySchema = z.number().int().min(1);
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const DateRangeSchema = z.object({
  inicio: DateSchema,
  fim: DateSchema,
});

function zodIssues(error) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

// ── IdSchema ────────────────────────────────────────────────────────────────

test("IdSchema: aceita inteiros positivos", () => {
  assert.equal(IdSchema.parse(1), 1);
  assert.equal(IdSchema.parse(999_999_999), 999_999_999);
});

test("IdSchema: coerce string numerica", () => {
  assert.equal(IdSchema.parse("42"), 42);
});

test("IdSchema: rejeita 0, negativos, fracoes, string nao numerica", () => {
  assert.throws(() => IdSchema.parse(0));
  assert.throws(() => IdSchema.parse(-1));
  assert.throws(() => IdSchema.parse(1.5));
  assert.throws(() => IdSchema.parse("abc"));
  assert.throws(() => IdSchema.parse(null));
  assert.throws(() => IdSchema.parse(undefined));
});

// ── UuidSchema ──────────────────────────────────────────────────────────────

test("UuidSchema: aceita UUID v4 valido", () => {
  const ok = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(UuidSchema.parse(ok), ok);
});

test("UuidSchema: rejeita string nao-UUID", () => {
  assert.throws(() => UuidSchema.parse("nao-eh-uuid"));
  assert.throws(() => UuidSchema.parse("12345"));
  assert.throws(() => UuidSchema.parse(""));
});

// ── DateSchema ──────────────────────────────────────────────────────────────

test("DateSchema: aceita YYYY-MM-DD", () => {
  assert.equal(DateSchema.parse("2026-05-17"), "2026-05-17");
});

test("DateSchema: aceita YYYY-MM-DDTHH:mm:ssZ (timestamp ISO)", () => {
  const v = "2026-05-17T10:30:00Z";
  assert.equal(DateSchema.parse(v), v);
});

test("DateSchema: rejeita formato invalido", () => {
  assert.throws(() => DateSchema.parse("17/05/2026"));
  assert.throws(() => DateSchema.parse("2026-5-17"));
  assert.throws(() => DateSchema.parse("notadate"));
});

// ── MoneySchema ─────────────────────────────────────────────────────────────

test("MoneySchema: aceita >= 0", () => {
  assert.equal(MoneySchema.parse(0), 0);
  assert.equal(MoneySchema.parse(0.01), 0.01);
  assert.equal(MoneySchema.parse(1_000_000.99), 1_000_000.99);
});

test("MoneySchema: rejeita negativos", () => {
  assert.throws(() => MoneySchema.parse(-0.01));
  assert.throws(() => MoneySchema.parse(-1));
});

// ── WeightSchema ────────────────────────────────────────────────────────────

test("WeightSchema: aceita peso em gramas (com decimais)", () => {
  assert.equal(WeightSchema.parse(0.001), 0.001);
  assert.equal(WeightSchema.parse(2.345), 2.345);
});

test("WeightSchema: rejeita negativo", () => {
  assert.throws(() => WeightSchema.parse(-0.001));
});

// ── PercentSchema ───────────────────────────────────────────────────────────

test("PercentSchema: aceita 0 a 100", () => {
  assert.equal(PercentSchema.parse(0), 0);
  assert.equal(PercentSchema.parse(50), 50);
  assert.equal(PercentSchema.parse(100), 100);
});

test("PercentSchema: rejeita < 0 ou > 100", () => {
  assert.throws(() => PercentSchema.parse(-0.1));
  assert.throws(() => PercentSchema.parse(100.1));
  assert.throws(() => PercentSchema.parse(200));
});

// ── QuantitySchema ──────────────────────────────────────────────────────────

test("QuantitySchema: aceita inteiros >= 1", () => {
  assert.equal(QuantitySchema.parse(1), 1);
  assert.equal(QuantitySchema.parse(100), 100);
});

test("QuantitySchema: rejeita 0, negativos, fracoes", () => {
  assert.throws(() => QuantitySchema.parse(0));
  assert.throws(() => QuantitySchema.parse(-1));
  assert.throws(() => QuantitySchema.parse(1.5));
});

// ── PaginationSchema ────────────────────────────────────────────────────────

test("PaginationSchema: aceita page/limit numericos", () => {
  const out = PaginationSchema.parse({ page: 2, limit: 50 });
  assert.deepEqual(out, { page: 2, limit: 50 });
});

test("PaginationSchema: coerce de strings (query params vem como string)", () => {
  const out = PaginationSchema.parse({ page: "3", limit: "100" });
  assert.deepEqual(out, { page: 3, limit: 100 });
});

test("PaginationSchema: aceita vazio (campos opcionais)", () => {
  const out = PaginationSchema.parse({});
  assert.deepEqual(out, {});
});

test("PaginationSchema: rejeita limit > 500", () => {
  assert.throws(() => PaginationSchema.parse({ limit: 501 }));
});

test("PaginationSchema: rejeita page < 1", () => {
  assert.throws(() => PaginationSchema.parse({ page: 0 }));
});

// ── DateRangeSchema ─────────────────────────────────────────────────────────

test("DateRangeSchema: aceita inicio + fim validos", () => {
  const out = DateRangeSchema.parse({ inicio: "2026-01-01", fim: "2026-01-31" });
  assert.deepEqual(out, { inicio: "2026-01-01", fim: "2026-01-31" });
});

test("DateRangeSchema: rejeita se faltar inicio ou fim", () => {
  assert.throws(() => DateRangeSchema.parse({ inicio: "2026-01-01" }));
  assert.throws(() => DateRangeSchema.parse({ fim: "2026-01-31" }));
  assert.throws(() => DateRangeSchema.parse({}));
});

// ── Casos de uso reais — rotas modificadas ──────────────────────────────────

test("contas-pagar schema: descricao obrigatoria, valor > 0", () => {
  const Schema = z.object({
    descricao: z.string().min(1).max(500),
    fornecedor_id: IdSchema.optional(),
    valor: MoneySchema.refine((v) => v > 0, { message: "Valor deve ser maior que zero" }),
    data_vencimento: DateSchema.optional(),
    categoria: z.string().max(200).optional(),
    obs: z.string().max(5_000).optional(),
  });
  // Caso valido
  const ok = Schema.parse({ descricao: "Aluguel", valor: 100.5 });
  assert.equal(ok.descricao, "Aluguel");
  assert.equal(ok.valor, 100.5);

  // Faltando descricao
  assert.throws(() => Schema.parse({ valor: 100 }));
  // valor = 0
  assert.throws(() => Schema.parse({ descricao: "x", valor: 0 }));
  // valor negativo
  assert.throws(() => Schema.parse({ descricao: "x", valor: -1 }));
});

test("crediario/verificar-mp schema: payment_id obrigatorio nao-vazio", () => {
  const Schema = z.object({
    payment_id: z.string().min(1).max(100),
    obs: z.string().max(5_000).optional(),
  });
  assert.equal(Schema.parse({ payment_id: "12345" }).payment_id, "12345");
  assert.throws(() => Schema.parse({ payment_id: "" }));
  assert.throws(() => Schema.parse({}));
});

test("transferir estoque schema: origem != destino (refine)", () => {
  const Schema = z.object({
    produto_id: IdSchema,
    quantidade: z.number().positive(),
    local_origem_id: IdSchema,
    local_destino_id: IdSchema,
    ordem_solicitacao: z.string().min(1).max(200),
    obs: z.string().max(5_000).optional(),
  }).refine((d) => d.local_origem_id !== d.local_destino_id, {
    message: "Origem e destino devem ser diferentes",
    path: ["local_destino_id"],
  });

  const valido = {
    produto_id: 1, quantidade: 5,
    local_origem_id: 1, local_destino_id: 2,
    ordem_solicitacao: "ORD-001",
  };
  assert.doesNotThrow(() => Schema.parse(valido));

  const igual = { ...valido, local_destino_id: 1 };
  const r = Schema.safeParse(igual);
  assert.equal(r.success, false);
  if (!r.success) {
    const msg = zodIssues(r.error).find((i) => i.path === "local_destino_id");
    assert.ok(msg, "deve apontar local_destino_id");
    assert.match(msg.message, /Origem e destino/);
  }
});

test("devolucoes schema: itens com pelo menos 1 elemento", () => {
  const Schema = z.object({
    venda_id: IdSchema,
    tipo: z.enum(["parcial", "total"]),
    tipo_compensacao: z.string().min(1).max(50),
    itens: z.array(z.object({
      item_venda_id: IdSchema,
      quantidade: z.number().positive(),
    })).min(1).max(100),
  });
  const ok = Schema.parse({
    venda_id: 1, tipo: "parcial", tipo_compensacao: "vale",
    itens: [{ item_venda_id: 10, quantidade: 1 }],
  });
  assert.equal(ok.itens.length, 1);
  // itens vazio
  assert.throws(() => Schema.parse({
    venda_id: 1, tipo: "parcial", tipo_compensacao: "vale", itens: [],
  }));
  // tipo invalido
  assert.throws(() => Schema.parse({
    venda_id: 1, tipo: "xpto", tipo_compensacao: "vale",
    itens: [{ item_venda_id: 10, quantidade: 1 }],
  }));
});

test("inter/enviar schema: tipo enum + dados record permissivo", () => {
  const Schema = z.object({
    tipo: z.enum(["pix", "boleto", "ted"]),
    dados: z.record(z.string(), z.unknown()),
  });
  // pix com qrcode
  assert.doesNotThrow(() => Schema.parse({ tipo: "pix", dados: { qrcode: "abc" } }));
  // boleto
  assert.doesNotThrow(() => Schema.parse({ tipo: "boleto", dados: { codigoBarras: "123" } }));
  // tipo invalido
  assert.throws(() => Schema.parse({ tipo: "fake", dados: {} }));
  // dados ausente
  assert.throws(() => Schema.parse({ tipo: "pix" }));
});

test("ordens PATCH schema: campos nullable optional preservam comportamento", () => {
  const Schema = z.object({
    data_entrega: DateSchema.nullable().optional(),
    detalhes_ordem: z.string().max(10_000).nullable().optional(),
    situacao: z.string().max(50).nullable().optional(),
    cliente_id: IdSchema.nullable().optional(),
  }).partial();

  // null explicito eh aceito
  assert.deepEqual(Schema.parse({ cliente_id: null }), { cliente_id: null });
  // omitido eh aceito
  assert.deepEqual(Schema.parse({}), {});
  // valor valido
  assert.deepEqual(
    Schema.parse({ data_entrega: "2026-05-20", cliente_id: 42 }),
    { data_entrega: "2026-05-20", cliente_id: 42 },
  );
  // data invalida
  assert.throws(() => Schema.parse({ data_entrega: "20/05/2026" }));
});

test("webhook MP: schema permissivo (passthrough) preserva campos extras", () => {
  const Schema = z.object({
    type: z.string().max(50).optional(),
    data: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional(),
    live_mode: z.boolean().optional(),
  }).passthrough();

  // Payload tipico MP
  const mp = {
    type: "payment",
    action: "payment.created",
    data: { id: 12345 },
    live_mode: false,
    custom_field: "MP envia campos extras",
  };
  const parsed = Schema.parse(mp);
  assert.equal(parsed.type, "payment");
  assert.equal(parsed.data.id, 12345);
  // passthrough preserva campos nao mapeados
  assert.equal(parsed.custom_field, "MP envia campos extras");
});
