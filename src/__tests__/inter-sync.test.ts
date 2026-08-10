/**
 * Testes da rota POST/GET /api/financeiro/inter/sync
 *
 * Sincroniza status de pagamentos pendentes do Inter (até 200 por chamada).
 *
 * Regras:
 *   - Auth dupla:
 *       a) Header x-cron-secret == valor de inter.getInterCronSecret() (DB) ou
 *          process.env.INTER_CRON_SECRET → autoriza SEM precisar de user
 *       b) Caso contrário: exige user autenticado E role isFullAccess()
 *          (admin / desenvolvedor / diretor)
 *   - Busca contas com inter_pagamento_id NOT NULL, situacao='pendente',
 *     inter_status NOT IN ('PAGO','EXECUTADO','CANCELADO','REJEITADO')
 *   - Para cada conta com inter_tipo válido (pix/boleto/ted):
 *       - chama inter.getPagamento(id, tipo, contaPagarId)
 *       - se status mudou e mapeia 'pago' → UPDATE situacao='pago' + data_pagamento
 *       - se status mudou e NÃO mapeia 'pago' → UPDATE só inter_status
 *       - se status igual → UPDATE apenas inter_atualizado_em
 *   - Erros são acumulados em `erros[]` e o loop continua
 *
 * Nota importante: a rota retorna 403 (não 401) mesmo sem usuário —
 * "Sem permissão" é o erro genérico para autenticação E autorização falhando.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockGetInterCronSecret = vi.fn();
const mockGetPagamento = vi.fn();
const mockMapearStatusInter = vi.fn();
vi.mock("@/lib/inter", () => ({
  getInterCronSecret: mockGetInterCronSecret,
  getPagamento: mockGetPagamento,
  mapearStatusInter: mockMapearStatusInter,
}));

// ── Import depois dos mocks ───────────────────────────────────────────────────
const routeModule = await import("@/app/api/financeiro/inter/sync/route");
const POST = routeModule.POST;
const GET = routeModule.GET;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";
const CRON_SECRET_DB = "cron-secret-from-db";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/financeiro/inter/sync", {
    method: "POST",
    headers,
  });
}

interface ContaPendente {
  id: number;
  inter_pagamento_id: string;
  inter_tipo: "pix" | "boleto" | "ted" | string;
  inter_status: string | null;
  valor: string;
}

const contaBase: ContaPendente = {
  id: 1,
  inter_pagamento_id: "pag-abc-123",
  inter_tipo: "pix",
  inter_status: "AGUARDANDO_APROVACAO",
  valor: "100.00",
};

// Mapeamento default do mock: replica a lógica real
function defaultMapearStatusInter(status: string | null | undefined) {
  if (!status) return "desconhecido";
  const s = status.toUpperCase();
  if (s === "AGUARDANDO_APROVACAO") return "pendente_aprovacao";
  if (s === "APROVADO") return "aguardando_execucao";
  if (s === "PAGO" || s === "EXECUTADO") return "pago";
  if (s === "REJEITADO" || s === "ERRO") return "rejeitado";
  if (s === "CANCELADO") return "cancelado";
  return "desconhecido";
}

// ── Sanidade de exports ───────────────────────────────────────────────────────

describe("Exports do módulo /api/financeiro/inter/sync", () => {
  it("exporta POST", () => {
    expect(typeof POST).toBe("function");
  });

  it("exporta GET (alias de POST)", () => {
    expect(typeof GET).toBe("function");
    expect(GET).toBe(POST);
  });
});

// ── Testes ────────────────────────────────────────────────────────────────────

describe("POST /api/financeiro/inter/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockMapearStatusInter.mockImplementation(defaultMapearStatusInter);
    mockGetInterCronSecret.mockResolvedValue(CRON_SECRET_DB);
    delete process.env.INTER_CRON_SECRET;
  });

  // ── Auth: cron secret ─────────────────────────────────────────────────────

  it("autoriza com header x-cron-secret correto sem precisar de user", async () => {
    sqlMock.mockResolvedValueOnce([]); // SELECT pendentes vazio

    const res = await POST(
      makeRequest({ "x-cron-secret": CRON_SECRET_DB }),
    );

    expect(res.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data).toEqual({ processados: 0, atualizados: 0, erros: [] });
  });

  it("aceita cron secret vindo de process.env.INTER_CRON_SECRET quando DB retorna null", async () => {
    mockGetInterCronSecret.mockResolvedValueOnce(null);
    process.env.INTER_CRON_SECRET = "env-secret-xyz";
    sqlMock.mockResolvedValueOnce([]);

    const res = await POST(
      makeRequest({ "x-cron-secret": "env-secret-xyz" }),
    );

    expect(res.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("rejeita header x-cron-secret errado e exige usuário (401 sem user)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await POST(
      makeRequest({ "x-cron-secret": "secret-errado" }),
    );

    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("sem header x-cron-secret + user null: retorna 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("não autoriza por cron secret quando expected é null (DB e env vazios) — 401 sem user", async () => {
    mockGetInterCronSecret.mockResolvedValueOnce(null);
    delete process.env.INTER_CRON_SECRET;
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await POST(makeRequest({ "x-cron-secret": "" }));

    expect(res.status).toBe(401);
  });

  // ── Auth: user ────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado e sem cron secret", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  it.each(["consultora", "ourives", "motoboy", "pcp", "gerente_fabrica", "gerente_loja"])(
    "retorna 403 quando role não tem full access (%s)",
    async (role) => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
      sqlMock.mockResolvedValueOnce([{ role }]); // SELECT role

      const res = await POST(makeRequest());

      expect(res.status).toBe(403);
    },
  );

  it("retorna 403 quando user existe mas não está em alissonerp.usuarios", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([]); // SELECT role vazio

    const res = await POST(makeRequest());

    expect(res.status).toBe(403);
  });

  it.each(["admin", "desenvolvedor", "diretor"])("aceita role com full access (%s)", async (role) => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } } });
    sqlMock
      .mockResolvedValueOnce([{ role }])
      .mockResolvedValueOnce([]); // pendentes vazio

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
  });

  // ── Sucesso sem pendentes ────────────────────────────────────────────────

  it("sem contas pendentes: retorna processados=0 atualizados=0 erros=[]", async () => {
    sqlMock.mockResolvedValueOnce([]); // pendentes

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processados: 0, atualizados: 0, erros: [] });
    expect(mockGetPagamento).not.toHaveBeenCalled();
  });

  // ── Query de pendentes: forma ────────────────────────────────────────────

  it("query de pendentes filtra inter_pagamento_id NOT NULL, situacao='pendente' e exclui status finais", async () => {
    sqlMock.mockResolvedValueOnce([]); // pendentes vazio
    await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    // Primeira chamada após auth-cron é a SELECT de pendentes
    const selectCall = sqlMock.mock.calls[0];
    const sqlText = (selectCall[0] as string[]).join(" ");

    expect(sqlText).toMatch(/FROM\s+alissonerp\.contas_pagar/i);
    expect(sqlText).toMatch(/inter_pagamento_id\s+IS\s+NOT\s+NULL/i);
    expect(sqlText).toMatch(/status\s*=\s*'pendente'/i);
    expect(sqlText).toMatch(/inter_status\s+IS\s+NULL\s+OR\s+inter_status\s+NOT\s+IN/i);
    expect(sqlText).toMatch(/'PAGO'/);
    expect(sqlText).toMatch(/'EXECUTADO'/);
    expect(sqlText).toMatch(/'CANCELADO'/);
    expect(sqlText).toMatch(/'REJEITADO'/);
    expect(sqlText).toMatch(/LIMIT\s+200/i);
  });

  // ── Loop: status inalterado ──────────────────────────────────────────────

  it("status inalterado: faz UPDATE só de inter_atualizado_em e não conta como atualizado", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "AGUARDANDO_APROVACAO" };
    sqlMock
      .mockResolvedValueOnce([conta]) // pendentes
      .mockResolvedValueOnce([]); // UPDATE timestamp

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "AGUARDANDO_APROVACAO", // mesmo status
      valor: 100,
    });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processados: 1, atualizados: 0, erros: [] });

    // Verifica que o UPDATE foi de timestamp apenas
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/UPDATE\s+alissonerp\.contas_pagar/i);
    expect(sqlText).toMatch(/inter_atualizado_em\s*=\s*now\(\)/i);
    expect(sqlText).not.toMatch(/situacao/i);
    expect(sqlText).not.toMatch(/data_pagamento/i);
  });

  // ── Loop: status mudou para PAGO ─────────────────────────────────────────

  it("status mudou para PAGO: UPDATE situacao='pago' + data_pagamento da consulta", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "AGUARDANDO_APROVACAO" };
    sqlMock
      .mockResolvedValueOnce([conta]) // pendentes
      .mockResolvedValueOnce([]); // UPDATE conta

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "PAGO",
      valor: 100,
      dataPagamento: "2026-04-20",
    });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processados).toBe(1);
    expect(data.atualizados).toBe(1);
    expect(data.erros).toEqual([]);

    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    const values = updateCall.slice(1) as unknown[];
    expect(sqlText).toMatch(/status\s*=\s*'pago'/i);
    expect(sqlText).toMatch(/data_pagamento/i);
    expect(values).toContain("2026-04-20");
    expect(values).toContain("PAGO");
  });

  it("status PAGO sem dataPagamento: usa hoje como fallback", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "APROVADO" };
    sqlMock
      .mockResolvedValueOnce([conta])
      .mockResolvedValueOnce([]);

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "EXECUTADO",
      valor: 100,
      // sem dataPagamento
    });

    await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    const today = new Date().toISOString().slice(0, 10);
    expect(values).toContain(today);
    expect(values).toContain("EXECUTADO");
  });

  it("status EXECUTADO também mapeia para 'pago'", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "AGUARDANDO_APROVACAO" };
    sqlMock
      .mockResolvedValueOnce([conta])
      .mockResolvedValueOnce([]);

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "EXECUTADO",
      valor: 100,
      dataPagamento: "2026-04-21",
    });

    await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/status\s*=\s*'pago'/i);
  });

  // ── Loop: status mudou mas NÃO é pago ────────────────────────────────────

  it("status mudou para REJEITADO: UPDATE só inter_status (sem mexer em situacao)", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "AGUARDANDO_APROVACAO" };
    sqlMock
      .mockResolvedValueOnce([conta])
      .mockResolvedValueOnce([]);

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "REJEITADO",
      valor: 100,
    });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    const data = await res.json();
    expect(data.atualizados).toBe(1);

    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    const values = updateCall.slice(1) as unknown[];
    expect(sqlText).toMatch(/inter_status/i);
    expect(sqlText).not.toMatch(/situacao\s*=\s*'pago'/i);
    expect(sqlText).not.toMatch(/data_pagamento/i);
    expect(values).toContain("REJEITADO");
  });

  it("status mudou para APROVADO (aguardando_execucao): UPDATE só inter_status", async () => {
    const conta: ContaPendente = { ...contaBase, inter_status: "AGUARDANDO_APROVACAO" };
    sqlMock
      .mockResolvedValueOnce([conta])
      .mockResolvedValueOnce([]);

    mockGetPagamento.mockResolvedValueOnce({
      id: conta.inter_pagamento_id,
      status: "APROVADO",
      valor: 100,
    });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    const data = await res.json();
    expect(data.atualizados).toBe(1);
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).not.toMatch(/situacao\s*=\s*'pago'/i);
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("APROVADO");
  });

  // ── Loop: tipo inválido ──────────────────────────────────────────────────

  it("conta com inter_tipo inválido: pula sem chamar getPagamento", async () => {
    const conta: ContaPendente = { ...contaBase, inter_tipo: "tipo-invalido" };
    sqlMock.mockResolvedValueOnce([conta]); // só a SELECT, nenhum UPDATE

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processados: 1, atualizados: 0, erros: [] });
    expect(mockGetPagamento).not.toHaveBeenCalled();
  });

  // ── Loop: erro na chamada Inter ──────────────────────────────────────────

  it("erro na chamada Inter: registra em erros[] e continua próxima conta", async () => {
    const c1: ContaPendente = { ...contaBase, id: 1, inter_pagamento_id: "p1" };
    const c2: ContaPendente = { ...contaBase, id: 2, inter_pagamento_id: "p2" };

    sqlMock
      .mockResolvedValueOnce([c1, c2]) // pendentes (2)
      .mockResolvedValueOnce([]); // UPDATE da c2

    mockGetPagamento
      .mockRejectedValueOnce(new Error("Inter offline"))
      .mockResolvedValueOnce({
        id: "p2",
        status: "PAGO",
        valor: 100,
        dataPagamento: "2026-04-22",
      });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processados).toBe(2);
    expect(data.atualizados).toBe(1);
    expect(data.erros).toHaveLength(1);
    expect(data.erros[0]).toEqual({ id: 1, erro: "Inter offline" });
    expect(mockGetPagamento).toHaveBeenCalledTimes(2);
  });

  it("erro não-Error (string): converte com String(e)", async () => {
    const conta: ContaPendente = { ...contaBase };
    sqlMock.mockResolvedValueOnce([conta]);

    mockGetPagamento.mockRejectedValueOnce("falha-string");

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    const data = await res.json();
    expect(data.erros).toHaveLength(1);
    expect(data.erros[0]).toEqual({ id: conta.id, erro: "falha-string" });
  });

  // ── Múltiplas contas mistas ──────────────────────────────────────────────

  it("processa múltiplas contas: pago, sem mudança e tipo inválido juntos", async () => {
    const cPago: ContaPendente = { id: 1, inter_pagamento_id: "p1", inter_tipo: "pix", inter_status: "AGUARDANDO_APROVACAO", valor: "10" };
    const cIgual: ContaPendente = { id: 2, inter_pagamento_id: "p2", inter_tipo: "boleto", inter_status: "AGUARDANDO_APROVACAO", valor: "20" };
    const cInvalido: ContaPendente = { id: 3, inter_pagamento_id: "p3", inter_tipo: "x", inter_status: null, valor: "30" };
    const cTed: ContaPendente = { id: 4, inter_pagamento_id: "p4", inter_tipo: "ted", inter_status: "AGUARDANDO_APROVACAO", valor: "40" };

    sqlMock
      .mockResolvedValueOnce([cPago, cIgual, cInvalido, cTed]) // SELECT
      .mockResolvedValueOnce([]) // UPDATE cPago (pago)
      .mockResolvedValueOnce([]) // UPDATE cIgual (timestamp)
      .mockResolvedValueOnce([]); // UPDATE cTed (status novo)

    mockGetPagamento
      .mockResolvedValueOnce({ id: "p1", status: "PAGO", valor: 10, dataPagamento: "2026-04-20" })
      .mockResolvedValueOnce({ id: "p2", status: "AGUARDANDO_APROVACAO", valor: 20 })
      .mockResolvedValueOnce({ id: "p4", status: "REJEITADO", valor: 40 });

    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processados).toBe(4);
    // cInvalido é pulado (continue antes do try) → 2 atualizados
    expect(data.atualizados).toBe(2);
    expect(data.erros).toEqual([]);

    expect(mockGetPagamento).toHaveBeenCalledTimes(3);
    // chamada com tipo correto
    expect(mockGetPagamento).toHaveBeenNthCalledWith(1, "p1", "pix", 1);
    expect(mockGetPagamento).toHaveBeenNthCalledWith(2, "p2", "boleto", 2);
    expect(mockGetPagamento).toHaveBeenNthCalledWith(3, "p4", "ted", 4);
  });

  // ── Resposta ─────────────────────────────────────────────────────────────

  it("resposta sempre inclui processados, atualizados e erros[]", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));
    const data = await res.json();
    expect(data).toHaveProperty("processados");
    expect(data).toHaveProperty("atualizados");
    expect(data).toHaveProperty("erros");
    expect(Array.isArray(data.erros)).toBe(true);
  });

  // ── GET é alias de POST ───────────────────────────────────────────────────

  it("GET funciona igual ao POST (alias)", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await GET(makeRequest({ "x-cron-secret": CRON_SECRET_DB }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ processados: 0, atualizados: 0, erros: [] });
  });
});
