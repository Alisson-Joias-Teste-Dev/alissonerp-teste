/**
 * Testes da rota GET /api/vendas/[id]/mercado-pago/checar-point
 * Polling fallback quando webhook MP não chega.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = Object.assign(vi.fn(), {
  array: (a: unknown[]) => a,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(undefined)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockGetAccessToken = vi.fn(async () => "FAKE-TOKEN");
vi.mock("@/lib/mercado-pago", () => ({
  getAccessToken: mockGetAccessToken,
}));

const mockConcluirVenda = vi.fn();
vi.mock("@/lib/vendas-aprovar", () => ({
  concluirVenda: mockConcluirVenda,
}));

// Mock fetch global pra MP API
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const { GET } = await import("@/app/api/vendas/[id]/mercado-pago/checar-point/route");

const USER_ID = "user-uuid-1234";
const VENDA_ID = 100;
const PAGAMENTO_ID = 555;

function makeRequest(pagamentoId?: number) {
  const url = pagamentoId
    ? `http://localhost/api/vendas/100/mercado-pago/checar-point?pagamento_id=${pagamentoId}`
    : "http://localhost/api/vendas/100/mercado-pago/checar-point";
  return new NextRequest(url, { method: "GET" });
}
const makeParams = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

// A rota faz a checagem de ownership (Onda 1D) antes de tudo: 1 SELECT pro role
// do usuario + 1 SELECT pra requireVendaOwnership (venda_erp). Role admin =
// acesso total, sem query extra de vendedor_id. Enfileira as duas primeiro.
function mockOwnershipOk() {
  sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
  sqlMock.mockResolvedValueOnce([{ vendedor_id: null }]);
}

describe("GET /api/vendas/[id]/mercado-pago/checar-point", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockGetAccessToken.mockResolvedValue("FAKE-TOKEN");
    (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
  });

  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(401);
  });

  it("400 quando id da venda não é numérico", async () => {
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("400 quando pagamento_id ausente", async () => {
    const res = await GET(makeRequest(), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  it("404 quando pagamento Point não existe", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([]);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("retorna ja_confirmado=true quando pagamento já confirmado", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "confirmado",
      valor: 1000, gateway_payload: {},
    }]);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("confirmado");
    expect(data.ja_confirmado).toBe(true);
  });

  it("retorna status=cancelado quando pagamento cancelado", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "cancelado",
      valor: 1000, gateway_payload: {},
    }]);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("cancelado");
  });

  it("502 quando getAccessToken falha", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
      valor: 1000, gateway_payload: {},
    }]);
    mockGetAccessToken.mockRejectedValueOnce(new Error("MP não configurado"));
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
  });

  it("retorna mp_pending=true quando search MP falha (não-200)", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
      valor: 1000, gateway_payload: {},
    }]);
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      json: async () => ({ message: "internal" }),
    } as Response);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    const data = await res.json();
    expect(data.mp_pending).toBe(true);
    expect(data.status).toBe("pendente");
  });

  it("retorna pendente quando MP search não acha pagamento approved", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
      valor: 1000, gateway_payload: {},
    }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ id: 1, status: "rejected" }] }),
    } as Response);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    const data = await res.json();
    expect(data.mp_pending).toBe(true);
  });

  it("retorna pendente quando search retorna lista vazia", async () => {
    mockOwnershipOk();
    sqlMock.mockResolvedValueOnce([{
      id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
      valor: 1000, gateway_payload: {},
    }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    const data = await res.json();
    expect(data.mp_pending).toBe(true);
    expect(data.status).toBe("pendente");
  });

  it("sucesso: pagamento approved + soma cobre venda → confirma e conclui", async () => {
    mockOwnershipOk();
    sqlMock
      .mockResolvedValueOnce([{
        id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
        valor: 1000, gateway_payload: {},
      }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 999,
          status: "approved",
          transaction_amount: 1000,
          transaction_details: { net_received_amount: 970 },
          fee_details: [{ amount: 30 }],
        }],
      }),
    } as Response);
    // Dentro de sql.begin
    sqlMock.mockResolvedValueOnce([]); // UPDATE pagamento
    sqlMock.mockResolvedValueOnce([{ soma_confirmados: 1000, total_venda: 1000 }]); // soma
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("confirmado");
    expect(data.payment_id).toBe("999");
    // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda sozinho
    // (isso só acontece na entrega) — a rota só informa que quitou.
    expect(data.pagamento_quitado).toBe(true);
    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("approved + soma parcial: confirma mas NÃO conclui (quitada=false)", async () => {
    mockOwnershipOk();
    sqlMock
      .mockResolvedValueOnce([{
        id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
        valor: 500, gateway_payload: {},
      }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 999, status: "approved",
          transaction_amount: 500,
          transaction_details: { net_received_amount: 480 },
        }],
      }),
    } as Response);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([{ soma_confirmados: 500, total_venda: 1000 }]);
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("confirmado");
    expect(data.pagamento_quitado).toBe(false);
    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("calcula taxas_mp = transaction_amount - net_received_amount", async () => {
    mockOwnershipOk();
    sqlMock
      .mockResolvedValueOnce([{
        id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
        valor: 1000, gateway_payload: {},
      }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{
          id: 999, status: "approved",
          transaction_amount: 1000,
          transaction_details: { net_received_amount: 870 },
        }],
      }),
    } as Response);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([{ soma_confirmados: 500, total_venda: 1000 }]);
    await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    // Verifica UPDATE com valor_liquido=870 e taxas_mp=130
    const updateCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /UPDATE.*pagamentos_venda/i.test(tpl) && /valor_liquido/i.test(tpl);
    })!;
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain(870);
    expect(values).toContain(130);
  });

  it("erro do concluirVenda não falha a rota (best-effort)", async () => {
    mockOwnershipOk();
    sqlMock
      .mockResolvedValueOnce([{
        id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
        valor: 1000, gateway_payload: {},
      }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ id: 999, status: "approved", transaction_amount: 1000 }],
      }),
    } as Response);
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([{ soma_confirmados: 1000, total_venda: 1000 }]);
    sqlMock.mockResolvedValueOnce([{ valor: "uuid-system" }]);
    mockConcluirVenda.mockRejectedValueOnce(new Error("Tiny offline"));
    const res = await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    // Pagamento já confirmado, retorna 200 OK mesmo com erro no concluir
    expect(res.status).toBe(200);
  });

  it("query MP usa external_reference correto", async () => {
    mockOwnershipOk();
    sqlMock
      .mockResolvedValueOnce([{
        id: PAGAMENTO_ID, venda_id: VENDA_ID, status: "pendente",
        valor: 1000, gateway_payload: {},
      }]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    await GET(makeRequest(PAGAMENTO_ID), makeParams(VENDA_ID));
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain(`external_reference=`);
    expect(fetchUrl).toContain(`venda%3A${VENDA_ID}%3Apag%3A${PAGAMENTO_ID}`);
  });
});
