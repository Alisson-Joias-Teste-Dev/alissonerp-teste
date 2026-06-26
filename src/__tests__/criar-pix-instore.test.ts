/**
 * Testes da rota POST /api/vendas/[id]/mercado-pago/criar-pix-instore
 * Gera Pix In-Store (taxa 0%, igual maquininha) via In-Store QR API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockCreateInStore = vi.fn();
const mockGetWebhookBaseUrl = vi.fn(async () => "https://erp.alissonjoias.com.br");
vi.mock("@/lib/mercado-pago", () => ({
  createInStorePixQr: mockCreateInStore,
  getWebhookBaseUrl: mockGetWebhookBaseUrl,
}));

const { POST } = await import("@/app/api/vendas/[id]/mercado-pago/criar-pix-instore/route");

const USER_ID = "user-uuid-1234";
const VENDA_ID = 100;

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/vendas/100/mercado-pago/criar-pix-instore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const makeParams = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

function mockHappy(opts?: { reusarExistente?: boolean }) {
  sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]);
  sqlMock.mockResolvedValueOnce([{
    id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
    bloqueado: false, total_venda: "1000.00", vendedor_id: null,
  }]);
  sqlMock.mockResolvedValueOnce([{ soma_confirmados: 0 }]);
  if (opts?.reusarExistente) {
    sqlMock.mockResolvedValueOnce([{ id: 555 }]);
    sqlMock.mockResolvedValueOnce([]);
  } else {
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([{ id: 555 }]);
  }
  mockCreateInStore.mockResolvedValueOnce({
    qr_data: "00020126...EMV",
    in_store_order_id: "INSTORE-123",
  });
  sqlMock.mockResolvedValueOnce([]);
}

describe("POST /api/vendas/[id]/mercado-pago/criar-pix-instore", () => {
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

  it.each(["motoboy", "ourives", "pcp"])(
    "retorna 403 quando role é %s",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role }]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(403);
    },
  );

  it.each(["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"])(
    "aceita role %s",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role, vendedor_id: null }]);
      sqlMock.mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00", vendedor_id: null,
      }]);
      sqlMock.mockResolvedValueOnce([{ soma_confirmados: 0 }]);
      sqlMock.mockResolvedValueOnce([]);
      sqlMock.mockResolvedValueOnce([{ id: 555 }]);
      mockCreateInStore.mockResolvedValueOnce({ qr_data: "x", in_store_order_id: "y" });
      sqlMock.mockResolvedValueOnce([]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(200);
    },
  );

  it("403 quando consultora cobra venda de outra vendedora", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora", vendedor_id: 10 }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00", vendedor_id: 99,
      }]);
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
      .mockResolvedValueOnce([{
        id: VENDA_ID, situacao: "rascunho", bloqueado: true,
        total_venda: "1000.00", vendedor_id: null, numero_venda: "V-100",
      }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it.each(["concluido", "cancelado"])(
    "409 quando venda em situação '%s'",
    async (situacao) => {
      sqlMock
        .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
        .mockResolvedValueOnce([{
          id: VENDA_ID, situacao, bloqueado: false,
          total_venda: "1000.00", vendedor_id: null, numero_venda: "V-100",
        }]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(409);
    },
  );

  it("409 quando venda já totalmente paga", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, situacao: "rascunho", bloqueado: false,
        total_venda: "1000.00", vendedor_id: null, numero_venda: "V-100",
      }])
      .mockResolvedValueOnce([{ soma_confirmados: 1000 }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("400 quando valorCobranca = 0", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, situacao: "rascunho", bloqueado: false,
        total_venda: "1000.00", vendedor_id: null, numero_venda: "V-100",
      }])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }]);
    const res = await POST(makeRequest({ valor: 0 }), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("reusa pagamento Pix In-Store existente (UPDATE em vez de INSERT)", async () => {
    mockHappy({ reusarExistente: true });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const updateCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /UPDATE.*pagamentos_venda/i.test(tpl) && /SET\s+valor/i.test(tpl);
    });
    expect(updateCall).toBeDefined();
  });

  it("cria novo pagamento Pix In-Store quando não há existente", async () => {
    mockHappy({ reusarExistente: false });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const insertCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /INSERT INTO.*pagamentos_venda/i.test(tpl);
    });
    expect(insertCall).toBeDefined();
  });

  it("sucesso retorna qr_code, pagamento_id e valor", async () => {
    mockHappy();
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.qr_code).toMatch(/^00020126/);
    expect(data.pagamento_id).toBe(555);
    expect(data.valor).toBe(1000);
  });

  it("502 quando MP API falha", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, situacao: "rascunho", bloqueado: false,
        total_venda: "1000.00", vendedor_id: null, numero_venda: "V-100",
      }])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreateInStore.mockRejectedValueOnce(new Error("In-Store API down"));
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/In-Store API down/);
  });

  it("salva forma='Pix' e gateway='Mercado Pago Pix In-Store' no INSERT", async () => {
    mockHappy({ reusarExistente: false });
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const insertCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /INSERT INTO.*pagamentos_venda/i.test(tpl);
    })!;
    const sqlText = (insertCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/'Pix'/);
    expect(sqlText).toMatch(/'Mercado Pago Pix In-Store'/);
  });
});
