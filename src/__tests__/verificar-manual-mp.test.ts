/**
 * Testes da rota POST /api/vendas/[id]/mercado-pago/verificar-manual
 *
 * Cobre:
 *  1. Auth (401)
 *  2. Permissão (403)
 *  3. Validação de body (400 sem payment_id)
 *  4. Conflito (409 duplicata por gateway_id)
 *  5. Venda não encontrada (404)
 *  6. Venda bloqueada (409)
 *  7. Situação inválida (409)
 *  8. Erro do MP (502)
 *  9. Status MP não-approved (422)
 * 10. Valor MP <= 0 (422)
 * 11. Venda já totalmente paga (409)
 * 12. Mapeamento de payment_type_id → forma ERP
 * 13. Cálculo de valor_liquido / taxas_mp
 * 14. INSERT path (sem pagamento_id)
 * 15. UPDATE path (com pagamento_id)
 * 16. Conclui venda em "aprovado" quando totalmente paga
 * 17. Não conclui venda em "rascunho"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockFetchPayment = vi.fn();
vi.mock("@/lib/mercado-pago", () => ({
  fetchPayment: (...args: unknown[]) => mockFetchPayment(...args),
}));

const mockConcluirVenda = vi.fn();
vi.mock("@/lib/vendas-aprovar", () => ({
  concluirVenda: (...args: unknown[]) => mockConcluirVenda(...args),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import("@/app/api/vendas/[id]/mercado-pago/verificar-manual/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";
const VENDA_ID = 42;

function makeRequest(body: Record<string, unknown> | null = {}) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== null) init.body = JSON.stringify(body);
  return new NextRequest(
    `http://localhost/api/vendas/${VENDA_ID}/mercado-pago/verificar-manual`,
    init,
  );
}

function makeParams(id: number = VENDA_ID) {
  return { params: Promise.resolve({ id: String(id) }) };
}

type MpData = {
  status?: string;
  transaction_amount?: number;
  payment_type_id?: string;
  payment_method_id?: string;
  transaction_details?: { net_received_amount?: number };
  installments?: number;
  date_approved?: string;
};

/**
 * Setup do happy path:
 *  1. SELECT usuarios     → role permitido
 *  2. SELECT duplicata    → []
 *  3. SELECT venda        → venda válida
 *  4. SELECT soma_confirmados → 0
 *  5. INSERT/UPDATE       → retorna id (no INSERT) ou nada (UPDATE)
 *  6. SELECT nova_soma    → soma final
 */
function setupHappyPath(opts: {
  role?: string;
  vendaSituacao?: "rascunho" | "aprovado";
  vendaBloqueado?: boolean;
  totalVenda?: number;
  somaConfirmados?: number;
  novaSoma?: number;
  pagamentoId?: number;
  isUpdate?: boolean;
} = {}) {
  const {
    role = "consultora",
    vendaSituacao = "rascunho",
    vendaBloqueado = false,
    totalVenda = 1000,
    somaConfirmados = 0,
    novaSoma,
    pagamentoId = 99,
    isUpdate = false,
  } = opts;

  sqlMock
    .mockResolvedValueOnce([{ role, vendedor_id: 1 }]) // usuario
    .mockResolvedValueOnce([])                           // duplicata
    .mockResolvedValueOnce([{
      id: VENDA_ID,
      numero_venda: "V001",
      situacao: vendaSituacao,
      bloqueado: vendaBloqueado,
      total_venda: totalVenda,
    }])
    .mockResolvedValueOnce([{ soma_confirmados: somaConfirmados }]);

  if (isUpdate) {
    sqlMock.mockResolvedValueOnce([]); // UPDATE não retorna nada relevante
  } else {
    sqlMock.mockResolvedValueOnce([{ id: pagamentoId }]); // INSERT RETURNING id
  }

  sqlMock.mockResolvedValueOnce([{
    nova_soma: novaSoma ?? somaConfirmados + totalVenda,
  }]);
}

function defaultMpApproved(overrides: Partial<MpData> = {}): MpData {
  return {
    status: "approved",
    transaction_amount: 1000,
    payment_type_id: "pix",
    payment_method_id: "pix",
    transaction_details: { net_received_amount: 0 },
    installments: 1,
    date_approved: "2026-04-25T10:00:00Z",
    ...overrides,
  };
}

/** Encontra os argumentos interpolados de uma chamada SQL contendo 'INSERT INTO alissonerp.pagamentos_venda' */
function findInsertCall() {
  return sqlMock.mock.calls.find((call) => {
    const parts = call[0] as string[] | undefined;
    if (!Array.isArray(parts)) return false;
    const joined = parts.join(" ");
    return joined.includes("INSERT INTO alissonerp.pagamentos_venda");
  });
}

/** Encontra a chamada de UPDATE de pagamentos_venda */
function findUpdateCall() {
  return sqlMock.mock.calls.find((call) => {
    const parts = call[0] as string[] | undefined;
    if (!Array.isArray(parts)) return false;
    const joined = parts.join(" ");
    return joined.includes("UPDATE alissonerp.pagamentos_venda");
  });
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST /api/vendas/[id]/mercado-pago/verificar-manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    sqlMock.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth & permissão ───────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({ payment_id: "MP123" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("retorna 403 quando role não está permitida (ex: ourives)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "ourives", vendedor_id: null }]);
    const res = await POST(makeRequest({ payment_id: "MP123" }), makeParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permiss/i);
  });

  it("retorna 403 quando usuário não existe na tabela", async () => {
    sqlMock.mockResolvedValueOnce([]); // SELECT usuarios → vazio
    const res = await POST(makeRequest({ payment_id: "MP123" }), makeParams());
    expect(res.status).toBe(403);
  });

  // ── Validação de body & params ─────────────────────────────────────────────

  it("retorna 400 quando body não tem payment_id", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora", vendedor_id: 1 }]);
    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/pagamento/i);
  });

  it("retorna 400 quando payment_id é string vazia", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora", vendedor_id: 1 }]);
    const res = await POST(makeRequest({ payment_id: "   " }), makeParams());
    expect(res.status).toBe(400);
  });

  // ── Conflito por duplicata ─────────────────────────────────────────────────

  it("retorna 409 quando gateway_id já existe (duplicata)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora", vendedor_id: 1 }])
      .mockResolvedValueOnce([{ id: 555 }]); // duplicata encontrada
    const res = await POST(makeRequest({ payment_id: "MP-DUP" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/já está registrado/i);
  });

  // ── Venda ──────────────────────────────────────────────────────────────────

  it("retorna 404 quando venda não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])   // duplicata
      .mockResolvedValueOnce([]);  // venda não encontrada
    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("retorna 409 quando venda está bloqueada", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: true, total_venda: 1000,
      }]);
    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/bloqueada/i);
  });

  it("retorna 409 quando venda está em situação inválida (concluida)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "concluida",
        bloqueado: false, total_venda: 1000,
      }]);
    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/situação/i);
  });

  it("retorna 409 quando venda em situação 'cancelada'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "cancelada",
        bloqueado: false, total_venda: 1000,
      }]);
    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(409);
  });

  // ── MP API ────────────────────────────────────────────────────────────────

  it("retorna 502 quando fetchPayment lança erro", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: false, total_venda: 1000,
      }]);
    mockFetchPayment.mockRejectedValueOnce(new Error("MP indisponível"));

    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/MP indisponível/);
  });

  it("retorna 422 quando MP status não é 'approved'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: false, total_venda: 1000,
      }]);
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({ status: "rejected" }));

    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.mp_status).toBe("rejected");
  });

  it("retorna 422 quando MP retorna null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: false, total_venda: 1000,
      }]);
    mockFetchPayment.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(422);
  });

  it("retorna 422 quando transaction_amount <= 0", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: false, total_venda: 1000,
      }]);
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({ transaction_amount: 0 }));

    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/inválido/i);
  });

  // ── Venda já paga ─────────────────────────────────────────────────────────

  it("retorna 409 quando venda já está totalmente paga", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: VENDA_ID, numero_venda: "V01", situacao: "rascunho",
        bloqueado: false, total_venda: 1000,
      }])
      .mockResolvedValueOnce([{ soma_confirmados: 1000 }]); // já pago
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({ transaction_amount: 500 }));

    const res = await POST(makeRequest({ payment_id: "MP1" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/totalmente paga/i);
  });

  // ── Mapeamento payment_type_id → forma ERP ────────────────────────────────

  describe("Mapeamento de forma ERP", () => {
    const cases: Array<{ ptype: string; expected: string }> = [
      { ptype: "credit_card",   expected: "Cartão de Crédito" },
      { ptype: "debit_card",    expected: "Cartão de Crédito" },
      { ptype: "pix",           expected: "Pix" },
      { ptype: "ticket",        expected: "A Receber" },
      { ptype: "bank_transfer", expected: "Pix" },
      { ptype: "account_money", expected: "Pix" },
      { ptype: "marciano_xpto", expected: "Pix" }, // fallback
    ];

    for (const { ptype, expected } of cases) {
      it(`payment_type_id="${ptype}" → forma="${expected}"`, async () => {
        setupHappyPath({ totalVenda: 1000, somaConfirmados: 0, novaSoma: 0 });
        mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
          payment_type_id: ptype,
          transaction_amount: 500,
        }));

        const res = await POST(makeRequest({ payment_id: "MP-X" }), makeParams());
        expect(res.status).toBe(200);

        const insertCall = findInsertCall();
        expect(insertCall).toBeDefined();
        const values = insertCall!.slice(1) as unknown[];
        expect(values).toContain(expected);
      });
    }
  });

  // ── Cálculo de valor_liquido / taxas_mp ───────────────────────────────────

  it("calcula valor_liquido=9713 e taxas_mp=1287 quando MP retorna net_received_amount=9713 e transaction_amount=11000", async () => {
    setupHappyPath({ totalVenda: 20000, somaConfirmados: 0, novaSoma: 11000 });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "credit_card",
      transaction_amount: 11000,
      transaction_details: { net_received_amount: 9713 },
    }));

    const res = await POST(makeRequest({ payment_id: "MP-CC" }), makeParams());
    expect(res.status).toBe(200);

    const insertCall = findInsertCall();
    expect(insertCall).toBeDefined();
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain(9713);   // valor_liquido
    expect(values).toContain(1287);   // taxas_mp = 11000 - 9713
  });

  it("valor_liquido=null e taxas_mp=null quando net_received_amount não retornado", async () => {
    setupHappyPath({ totalVenda: 1000, somaConfirmados: 0, novaSoma: 1000 });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "pix",
      transaction_amount: 1000,
      transaction_details: undefined,
    }));

    const res = await POST(makeRequest({ payment_id: "MP-PIX" }), makeParams());
    expect(res.status).toBe(200);

    const insertCall = findInsertCall();
    expect(insertCall).toBeDefined();
    const values = insertCall!.slice(1) as unknown[];
    // Verificamos pela contagem de nulls — devem aparecer pelo menos 2 (valor_liquido + taxas_mp)
    const nulls = values.filter((v) => v === null);
    expect(nulls.length).toBeGreaterThanOrEqual(2);
  });

  // ── INSERT vs UPDATE path ─────────────────────────────────────────────────

  it("INSERT path: sem pagamento_id no body, usa forma mapeada (não 'Pix' hardcoded)", async () => {
    setupHappyPath({ totalVenda: 1000, somaConfirmados: 0, novaSoma: 500 });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "credit_card",
      transaction_amount: 500,
    }));

    const res = await POST(makeRequest({ payment_id: "MP-NEW" }), makeParams());
    expect(res.status).toBe(200);

    expect(findInsertCall()).toBeDefined();
    expect(findUpdateCall()).toBeUndefined();

    const values = findInsertCall()!.slice(1) as unknown[];
    expect(values).toContain("Cartão de Crédito");
    expect(values).not.toContain("Pix");
  });

  it("UPDATE path: com pagamento_id no body, atualiza forma + valor_liquido + taxas_mp + parcelas", async () => {
    setupHappyPath({
      totalVenda: 11000,
      somaConfirmados: 0,
      novaSoma: 11000,
      isUpdate: true,
    });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "credit_card",
      transaction_amount: 11000,
      transaction_details: { net_received_amount: 9713 },
      installments: 6,
    }));

    const res = await POST(
      makeRequest({ payment_id: "MP-UPD", pagamento_id: 777 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pagamento_id).toBe(777);

    expect(findUpdateCall()).toBeDefined();
    expect(findInsertCall()).toBeUndefined();

    const values = findUpdateCall()!.slice(1) as unknown[];
    expect(values).toContain("Cartão de Crédito");  // forma atualizada
    expect(values).toContain(9713);                  // valor_liquido
    expect(values).toContain(1287);                  // taxas_mp
    expect(values).toContain(6);                     // parcelas
    expect(values).toContain(777);                   // WHERE id
  });

  // ── Conclusão da venda ────────────────────────────────────────────────────

  it("conclui venda quando totalmente paga e situação='aprovado'", async () => {
    setupHappyPath({
      vendaSituacao: "aprovado",
      totalVenda: 1000,
      somaConfirmados: 0,
      novaSoma: 1000,
    });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "pix",
      transaction_amount: 1000,
    }));
    mockConcluirVenda.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ payment_id: "MP-CONC" }), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venda_concluida).toBe(true);
    expect(mockConcluirVenda).toHaveBeenCalledWith(VENDA_ID, USER_ID, { tinyBestEffort: true });
  });

  it("não conclui venda em rascunho mesmo se totalmente paga", async () => {
    setupHappyPath({
      vendaSituacao: "rascunho",
      totalVenda: 1000,
      somaConfirmados: 0,
      novaSoma: 1000,
    });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "pix",
      transaction_amount: 1000,
    }));

    const res = await POST(makeRequest({ payment_id: "MP-RASC" }), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venda_concluida).toBe(false);
    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("não conclui venda parcialmente paga em 'aprovado'", async () => {
    setupHappyPath({
      vendaSituacao: "aprovado",
      totalVenda: 1000,
      somaConfirmados: 0,
      novaSoma: 500, // só metade paga
    });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "pix",
      transaction_amount: 500,
    }));

    const res = await POST(makeRequest({ payment_id: "MP-PART" }), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.venda_concluida).toBe(false);
    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("retorna venda_concluida=false quando concluirVenda falha (best-effort)", async () => {
    setupHappyPath({
      vendaSituacao: "aprovado",
      totalVenda: 1000,
      somaConfirmados: 0,
      novaSoma: 1000,
    });
    mockFetchPayment.mockResolvedValueOnce(defaultMpApproved({
      payment_type_id: "pix",
      transaction_amount: 1000,
    }));
    mockConcluirVenda.mockRejectedValueOnce(new Error("falhou"));

    // Suprime console.error
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ payment_id: "MP-FAIL" }), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.venda_concluida).toBe(false);

    errSpy.mockRestore();
  });
});
