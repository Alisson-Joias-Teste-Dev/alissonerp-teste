/**
 * Testes da rota POST /api/vendas/[id]/mercado-pago/criar-link
 * Cria Preference (link de pagamento) MP para a venda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockCreatePreference = vi.fn();
const mockGetWebhookBaseUrl = vi.fn(async () => "https://erp.alissonjoias.com.br");
vi.mock("@/lib/mercado-pago", () => ({
  createPreference: mockCreatePreference,
  getWebhookBaseUrl: mockGetWebhookBaseUrl,
}));

const { POST } = await import("@/app/api/vendas/[id]/mercado-pago/criar-link/route");

const USER_ID = "user-uuid-1234";
const VENDA_ID = 100;

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/vendas/100/mercado-pago/criar-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const makeParams = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

const VENDA_OK = {
  id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
  bloqueado: false, total_venda: "1000.00", total_produtos: "1000.00",
  total_desconto: "0", total_frete: "0", cliente_id: 1, vendedor_id: null,
  token_compartilhamento: "abc-token",
  cliente_nome: "João Silva", cliente_cpf_cnpj: "12345678901",
  cliente_email: "joao@test.com",
};

function mockHappy(opts?: { reusarExistente?: boolean }) {
  sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]); // role
  sqlMock.mockResolvedValueOnce([VENDA_OK]); // venda
  sqlMock.mockResolvedValueOnce([
    { nome_produto: "Anel", quantidade: 1, preco_unitario: "1000.00" },
  ]); // itens
  sqlMock.mockResolvedValueOnce([]); // fragmento sql``
  sqlMock.mockResolvedValueOnce([{ soma_confirmados: 0 }]); // soma
  if (opts?.reusarExistente) {
    sqlMock.mockResolvedValueOnce([{ id: 555 }]); // existente
    sqlMock.mockResolvedValueOnce([]); // UPDATE
  } else {
    sqlMock.mockResolvedValueOnce([]); // não existente
    sqlMock.mockResolvedValueOnce([{ id: 555 }]); // INSERT RETURNING
  }
  mockCreatePreference.mockResolvedValueOnce({
    id: "pref-abc-123",
    init_point: "https://mp.com/checkout/abc",
    sandbox_init_point: "https://mp.com/sandbox/abc",
  });
  sqlMock.mockResolvedValueOnce([]); // UPDATE final
}

describe("POST /api/vendas/[id]/mercado-pago/criar-link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockGetWebhookBaseUrl.mockResolvedValue("https://erp.alissonjoias.com.br");
  });

  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(401);
  });

  it.each(["motoboy", "ourives", "pcp"])("403 quando role é %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  it.each(["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"])(
    "aceita role %s",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role, vendedor_id: null }]);
      sqlMock.mockResolvedValueOnce([VENDA_OK]);
      sqlMock.mockResolvedValueOnce([{ nome_produto: "X", quantidade: 1, preco_unitario: "1000.00" }]);
      sqlMock.mockResolvedValueOnce([]);
      sqlMock.mockResolvedValueOnce([{ soma_confirmados: 0 }]);
      sqlMock.mockResolvedValueOnce([]);
      sqlMock.mockResolvedValueOnce([{ id: 555 }]);
      mockCreatePreference.mockResolvedValueOnce({ id: "p", init_point: "x", sandbox_init_point: "y" });
      sqlMock.mockResolvedValueOnce([]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(200);
    },
  );

  it("403 quando consultora cobra venda de outra vendedora", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora", vendedor_id: 10 }])
      .mockResolvedValueOnce([{ ...VENDA_OK, vendedor_id: 99 }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  it("400 quando id não numérico", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]);
    const res = await POST(makeRequest({}), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("404 quando venda não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("409 quando venda bloqueada", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{ ...VENDA_OK, bloqueado: true }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it.each(["concluido", "cancelado"])(
    "409 quando venda em situação '%s'",
    async (situacao) => {
      sqlMock
        .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
        .mockResolvedValueOnce([{ ...VENDA_OK, situacao }]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(409);
    },
  );

  it("400 quando venda sem itens", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("409 quando venda já totalmente paga", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([{ nome_produto: "X", quantidade: 1, preco_unitario: "1000.00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ soma_confirmados: 1000 }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("400 quando valorCobranca = 0", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([{ nome_produto: "X", quantidade: 1, preco_unitario: "1000.00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }]);
    const res = await POST(makeRequest({ valor: 0 }), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("502 quando MP API falha", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([{ nome_produto: "X", quantidade: 1, preco_unitario: "1000.00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreatePreference.mockRejectedValueOnce(new Error("MP API down"));
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
  });

  it("reusa pagamento Cartão pendente sem gateway (UPDATE)", async () => {
    mockHappy({ reusarExistente: true });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const updateCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /UPDATE.*pagamentos_venda/i.test(tpl) && /SET\s+gateway/i.test(tpl);
    });
    expect(updateCall).toBeDefined();
  });

  it("cria novo pagamento quando não há existente", async () => {
    mockHappy();
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const insertCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /INSERT INTO.*pagamentos_venda/i.test(tpl);
    });
    expect(insertCall).toBeDefined();
  });

  it("404 quando pagamento_id explícito não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([{ nome_produto: "X", quantidade: 1, preco_unitario: "1000.00" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ pagamento_id: 999 }), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("sucesso retorna preference_id, init_point, sandbox_init_point", async () => {
    mockHappy();
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.preference_id).toBe("pref-abc-123");
    expect(data.init_point).toMatch(/^https:\/\/mp\.com\/checkout/);
    expect(data.sandbox_init_point).toBeTruthy();
    expect(data.pagamento_id).toBe(555);
    expect(data.valor).toBe(1000);
  });

  it("repassa installments do body se >= 1", async () => {
    mockHappy();
    await POST(makeRequest({ installments: 6 }), makeParams(VENDA_ID));
    const callArg = mockCreatePreference.mock.calls[0][0];
    expect(callArg.installments).toBe(6);
  });

  it("ignora installments < 1 (passa undefined)", async () => {
    mockHappy();
    await POST(makeRequest({ installments: 0 }), makeParams(VENDA_ID));
    const callArg = mockCreatePreference.mock.calls[0][0];
    expect(callArg.installments).toBeUndefined();
  });

  it("monta items proporcionais ao valor de cobrança", async () => {
    mockHappy();
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const callArg = mockCreatePreference.mock.calls[0][0];
    expect(callArg.items).toHaveLength(1);
    expect(callArg.items[0].title).toBe("Anel");
    expect(callArg.items[0].quantity).toBe(1);
    expect(callArg.items[0].unit_price).toBeGreaterThan(0);
  });

  it("inclui backUrls com token de compartilhamento", async () => {
    mockHappy();
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const callArg = mockCreatePreference.mock.calls[0][0];
    expect(callArg.backUrls.success).toContain("abc-token");
    expect(callArg.backUrls.pending).toContain("abc-token");
    expect(callArg.backUrls.failure).toContain("abc-token");
  });
});
