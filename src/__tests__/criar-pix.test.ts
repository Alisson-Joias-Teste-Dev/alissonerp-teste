/**
 * Testes da rota POST /api/vendas/[id]/mercado-pago/criar-pix
 * Gera Pix nativo (EMV) via MP Payment API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockCreatePix = vi.fn();
const mockGetWebhookBaseUrl = vi.fn(async () => "https://erp.alissonjoias.com.br");
vi.mock("@/lib/mercado-pago", () => ({
  createPixPayment: mockCreatePix,
  getWebhookBaseUrl: mockGetWebhookBaseUrl,
}));

const { POST } = await import("@/app/api/vendas/[id]/mercado-pago/criar-pix/route");

const USER_ID = "user-uuid-1234";
const VENDA_ID = 100;

function makeRequest(body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/vendas/100/mercado-pago/criar-pix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const makeParams = (id: string | number) => ({
  params: Promise.resolve({ id: String(id) }),
});

function mockHappy(opts?: {
  role?: string;
  vendedor_id?: number;
  venda?: Record<string, unknown>;
  somaConfirmados?: number;
  reusarExistente?: boolean;
}) {
  // 1. SELECT role
  sqlMock.mockResolvedValueOnce([{
    role: opts?.role ?? "admin",
    vendedor_id: opts?.vendedor_id ?? null,
  }]);
  // 2. SELECT venda
  sqlMock.mockResolvedValueOnce([{
    id: VENDA_ID,
    numero_venda: "V-100",
    situacao: "rascunho",
    bloqueado: false,
    total_venda: "1000.00",
    cliente_id: 1,
    vendedor_id: opts?.vendedor_id ?? null,
    cliente_nome: "João Silva",
    cliente_cpf_cnpj: "12345678901",
    cliente_email: "joao@test.com",
    ...opts?.venda,
  }]);
  // 3. Fragmento vazio sql`` (o ternário sem pagamento_id chama sql`` antes)
  sqlMock.mockResolvedValueOnce([]);
  // 4. SELECT soma confirmados
  sqlMock.mockResolvedValueOnce([{ soma_confirmados: opts?.somaConfirmados ?? 0 }]);
  if (opts?.reusarExistente) {
    // 5. SELECT pagamento existente
    sqlMock.mockResolvedValueOnce([{ id: 555 }]);
    // 6. UPDATE
    sqlMock.mockResolvedValueOnce([]);
  } else {
    // 5. SELECT pagamento existente (vazio)
    sqlMock.mockResolvedValueOnce([]);
    // 6. INSERT RETURNING
    sqlMock.mockResolvedValueOnce([{ id: 555 }]);
  }
  // 7. MP API
  mockCreatePix.mockResolvedValueOnce({
    payment_id: "MP-123",
    status: "pending",
    qr_code: "00020126...EMV",
    qr_code_base64: "iVBORw0KGgo...",
    ticket_url: "https://mp.com/ticket",
    expiration_date: "2026-04-25T15:00:00Z",
  });
  // 8. UPDATE final
  sqlMock.mockResolvedValueOnce([]);
}

describe("POST /api/vendas/[id]/mercado-pago/criar-pix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockGetWebhookBaseUrl.mockResolvedValue("https://erp.alissonjoias.com.br");
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(401);
  });

  // ── Permissão ───────────────────────────────────────────────────────────────
  it.each(["motoboy", "ourives", "pcp", "estoquista_loja"])(
    "retorna 403 quando role é %s",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role }]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(403);
    },
  );

  it("retorna 403 quando usuário não cadastrado", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  it.each(["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"])(
    "aceita role %s",
    async (role) => {
      mockHappy({ role });
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(200);
    },
  );

  // ── Consultora: só vendas próprias ──────────────────────────────────────────
  it("403 quando consultora tenta cobrar venda de outra vendedora", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora", vendedor_id: 10 }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00", cliente_id: 1,
        vendedor_id: 99, // vendedor diferente
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(403);
  });

  // ── Validação de ID ─────────────────────────────────────────────────────────
  it("retorna 400 quando id não é numérico", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]);
    const res = await POST(makeRequest({}), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  // ── Venda ───────────────────────────────────────────────────────────────────
  it("retorna 404 quando venda não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  it("retorna 409 quando venda bloqueada", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: true, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it.each(["concluido", "cancelado", "estornado"])(
    "retorna 409 quando venda em situação '%s'",
    async (situacao) => {
      sqlMock
        .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
        .mockResolvedValueOnce([{
          id: VENDA_ID, numero_venda: "V-100", situacao,
          bloqueado: false, total_venda: "1000.00",
          cliente_id: 1, vendedor_id: null,
          cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
        }]);
      const res = await POST(makeRequest({}), makeParams(VENDA_ID));
      expect(res.status).toBe(409);
    },
  );

  // ── Valor ───────────────────────────────────────────────────────────────────
  it("retorna 409 quando venda já totalmente paga (sem pagamento_id)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }])
      .mockResolvedValueOnce([]) // fragmento sql`` vazio
      .mockResolvedValueOnce([{ soma_confirmados: 1000 }]);
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(409);
  });

  it("retorna 400 quando valorCobranca = 0", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }])
      .mockResolvedValueOnce([]) // fragmento sql`` vazio
      .mockResolvedValueOnce([{ soma_confirmados: 0 }]);
    const res = await POST(makeRequest({ valor: 0 }), makeParams(VENDA_ID));
    expect(res.status).toBe(400);
  });

  // ── Reuso de pagamento existente ────────────────────────────────────────────
  it("reusa pagamento Pix pendente sem gateway (UPDATE em vez de INSERT)", async () => {
    mockHappy({ reusarExistente: true });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    // Procura QUALQUER UPDATE em pagamentos_venda nas chamadas
    const updateCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /UPDATE.*pagamentos_venda/i.test(tpl) && /SET\s+gateway/i.test(tpl);
    });
    expect(updateCall).toBeDefined();
  });

  it("cria novo pagamento quando não há existente", async () => {
    mockHappy({ reusarExistente: false });
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const insertCall = sqlMock.mock.calls.find(c => {
      const tpl = (c[0] as string[]).join(" ");
      return /INSERT INTO.*pagamentos_venda/i.test(tpl);
    });
    expect(insertCall).toBeDefined();
  });

  // ── pagamento_id explícito ──────────────────────────────────────────────────
  it("retorna 404 quando pagamento_id explícito não existe na venda", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }])
      .mockResolvedValueOnce([]) // fragmento sql`AND id != ...` (interpolado)
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([]); // pagamento_id não existe
    const res = await POST(makeRequest({ pagamento_id: 999 }), makeParams(VENDA_ID));
    expect(res.status).toBe(404);
  });

  // ── Erro do MP API ──────────────────────────────────────────────────────────
  it("retorna 502 quando MP API falha", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }])
      .mockResolvedValueOnce([]) // fragmento sql``
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreatePix.mockRejectedValueOnce(new Error("MP API timeout"));
    sqlMock.mockResolvedValueOnce([]); // UPDATE com erro no payload
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/MP API timeout/);
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────
  it("sucesso: retorna QR code, payment_id, ticket_url e expiration_date", async () => {
    mockHappy();
    const res = await POST(makeRequest({}), makeParams(VENDA_ID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.payment_id).toBe("MP-123");
    expect(data.qr_code).toMatch(/^00020126/);
    expect(data.qr_code_base64).toMatch(/^iVBORw0KGgo/);
    expect(data.ticket_url).toBeTruthy();
    expect(data.expiration_date).toBeTruthy();
    expect(data.pagamento_id).toBe(555);
  });

  // ── Email padrão quando cliente sem email ───────────────────────────────────
  it("usa email placeholder quando cliente não tem email", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V-100", situacao: "rascunho",
        bloqueado: false, total_venda: "1000.00",
        cliente_id: 1, vendedor_id: null,
        cliente_nome: "X", cliente_cpf_cnpj: null, cliente_email: null,
      }])
      .mockResolvedValueOnce([]) // fragmento sql``
      .mockResolvedValueOnce([{ soma_confirmados: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 555 }]);
    mockCreatePix.mockResolvedValueOnce({
      payment_id: "MP-1", status: "pending",
      qr_code: "x", qr_code_base64: "y", ticket_url: "z", expiration_date: "now",
    });
    sqlMock.mockResolvedValueOnce([]);
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const callArg = mockCreatePix.mock.calls[0][0];
    expect(callArg.payer.email).toMatch(/@alissonjoias\.com\.br/);
  });

  // ── CPF/CNPJ ────────────────────────────────────────────────────────────────
  it("envia CPF apenas se tiver 11 dígitos (não envia CNPJ)", async () => {
    mockHappy({
      venda: {
        cliente_cpf_cnpj: "12345678000190", // CNPJ 14 dígitos
      },
    });
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const callArg = mockCreatePix.mock.calls[0][0];
    expect(callArg.payer.cpf).toBeUndefined();
  });

  it("envia CPF quando tem 11 dígitos", async () => {
    mockHappy({
      venda: { cliente_cpf_cnpj: "12345678901" },
    });
    await POST(makeRequest({}), makeParams(VENDA_ID));
    const callArg = mockCreatePix.mock.calls[0][0];
    expect(callArg.payer.cpf).toBe("12345678901");
  });
});
