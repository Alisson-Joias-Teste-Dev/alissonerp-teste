/**
 * Testes da rota POST/DELETE /api/vendas/[id]/mercado-pago/criar-intent-point
 * Cria intent na maquininha Point. DELETE cancela intent ativa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockCreatePoint = vi.fn();
const mockCancelPoint = vi.fn();
vi.mock("@/lib/mercado-pago", () => ({
  createPointIntent: mockCreatePoint,
  cancelPointIntent: mockCancelPoint,
}));

const routeMod = await import("@/app/api/vendas/[id]/mercado-pago/criar-intent-point/route");
const POST = routeMod.POST;
const DELETE = routeMod.DELETE;

const USER_ID = "user-uuid-1234";
const VENDA_ID = 100;

function makePost(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/vendas/100/mercado-pago/criar-intent-point", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
function makeDelete(pagamentoId?: number) {
  const url = pagamentoId
    ? `http://localhost/api/vendas/100/mercado-pago/criar-intent-point?pagamento_id=${pagamentoId}`
    : "http://localhost/api/vendas/100/mercado-pago/criar-intent-point";
  return new NextRequest(url, { method: "DELETE" });
}
const makeParams = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

const VENDA_OK = {
  id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
  bloqueado: false, total_venda: "1000.00", vendedor_id: null,
};
const DEVICE_OK = { device_id: "DEV-1", nome_legivel: "Maquininha Loja", ativo: true };

function mockHappyPost() {
  sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]); // role
  sqlMock.mockResolvedValueOnce([VENDA_OK]); // venda
  sqlMock.mockResolvedValueOnce([DEVICE_OK]); // device
  sqlMock.mockResolvedValueOnce([{ soma_confirmados: 0 }]); // soma
  sqlMock.mockResolvedValueOnce([{ id: 555 }]); // INSERT pagamento
  mockCreatePoint.mockResolvedValueOnce({ id: "intent-1", state: "OPEN" });
  sqlMock.mockResolvedValueOnce([]); // UPDATE com gateway_id
}

describe("POST /api/vendas/[id]/mercado-pago/criar-intent-point", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(401);
  });

  it.each(["motoboy", "ourives", "pcp"])("403 quando role é %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  it("400 quando id não numérico", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("400 quando body sem device_id", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]);
    const res = await POST(makePost({}), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("404 quando venda não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("409 quando venda bloqueada", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{ ...VENDA_OK, bloqueado: true }]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("403 quando consultora cobra venda de outra vendedora", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora", vendedor_id: 10 }])
      .mockResolvedValueOnce([{ ...VENDA_OK, vendedor_id: 99 }]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  it("404 quando maquininha inativa/não encontrada", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("409 quando venda já totalmente paga", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([DEVICE_OK])
      .mockResolvedValueOnce([{ soma_confirmados: 1000 }]);
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("400 quando valor < R$ 1,00", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([DEVICE_OK])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }]);
    const res = await POST(makePost({ device_id: "DEV-1", valor: 0.50 }), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("502 quando MP Point API falha", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([DEVICE_OK])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreatePoint.mockRejectedValueOnce(new Error("Point offline"));
    sqlMock.mockResolvedValueOnce([]); // UPDATE erro no payload
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
  });

  it("sucesso: cria intent e retorna pagamento_id, intent_id, device_id, valor, state", async () => {
    mockHappyPost();
    const res = await POST(makePost({ device_id: "DEV-1" }), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.pagamento_id).toBe(555);
    expect(data.intent_id).toBe("intent-1");
    expect(data.device_id).toBe("DEV-1");
    expect(data.state).toBe("OPEN");
    expect(data.valor).toBe(1000);
  });

  it("trunca valor no restante quando body.valor > restante (Math.min)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([DEVICE_OK])
      .mockResolvedValueOnce([{ soma_confirmados: 700 }])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreatePoint.mockResolvedValueOnce({ id: "intent-1", state: "OPEN" });
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makePost({ device_id: "DEV-1", valor: 999999 }), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valor).toBe(300); // restante
  });

  it("reuso de pagamento_id existente faz UPDATE em vez de INSERT", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([VENDA_OK])
      .mockResolvedValueOnce([DEVICE_OK])
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([{ id: 333 }]) // pre-criado
      .mockResolvedValueOnce([]); // UPDATE
    mockCreatePoint.mockResolvedValueOnce({ id: "intent-1", state: "OPEN" });
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makePost({ device_id: "DEV-1", pagamento_id: 333 }), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagamento_id).toBe(333);
  });
});

describe("DELETE /api/vendas/[id]/mercado-pago/criar-intent-point", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(401);
  });

  it("400 quando pagamento_id ausente", async () => {
    const res = await DELETE(makeDelete(), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("404 quando pagamento Point não existe", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("409 quando pagamento já confirmado", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 555, gateway_id: "intent-1",
      gateway_payload: { device_id: "DEV-1", intent_id: "intent-1" },
      status: "confirmado",
    }]);
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("400 quando intent_id ou device_id ausentes no payload", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 555, gateway_id: null,
      gateway_payload: {},
      status: "pendente",
    }]);
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("sucesso: cancela intent e marca pagamento como cancelado", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 555, gateway_id: "intent-1",
      gateway_payload: { device_id: "DEV-1", intent_id: "intent-1" },
      status: "pendente",
    }]);
    mockCancelPoint.mockResolvedValueOnce(undefined);
    sqlMock.mockResolvedValueOnce([]); // UPDATE cancelado
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    expect(mockCancelPoint).toHaveBeenCalledWith("DEV-1", "intent-1");
  });

  it("intent já expirada/processada (404 do MP) é tratado como cancelamento OK", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 555, gateway_id: "intent-1",
      gateway_payload: { device_id: "DEV-1", intent_id: "intent-1" },
      status: "pendente",
    }]);
    mockCancelPoint.mockRejectedValueOnce(new Error("404 not found"));
    sqlMock.mockResolvedValueOnce([]); // UPDATE cancelado
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
  });

  it("502 quando cancelamento falha por outro motivo", async () => {
    sqlMock.mockResolvedValueOnce([{
      id: 555, gateway_id: "intent-1",
      gateway_payload: { device_id: "DEV-1", intent_id: "intent-1" },
      status: "pendente",
    }]);
    mockCancelPoint.mockRejectedValueOnce(new Error("network failure"));
    sqlMock.mockResolvedValueOnce([]); // UPDATE com erro no payload
    const res = await DELETE(makeDelete(555), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
  });
});
