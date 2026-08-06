/**
 * Testes da rota POST /api/crediario/[id]/verificar-mp — recorte do
 * CREDIÁRIO PARCELADO.
 *
 * Por que existe um arquivo só pra isso: a rota depende de uma chamada real à
 * API do Mercado Pago (`fetchPayment`), que não dá pra exercitar no navegador
 * (o ambiente local não tem token do MP e não existe pagamento de sandbox
 * correspondente). Aqui o MP é mockado e o que se testa é o que a rota faz com
 * o `pagamentos_venda` da venda.
 *
 * REGRA DE NEGÓCIO: um crediário de N parcelas tem N linhas em contas_receber
 * mas UMA só linha 'A Receber' em pagamentos_venda (mig 317). Baixar UMA
 * parcela não pode confirmar o crediário inteiro — senão a venda fica 100%
 * paga com parcelas em aberto e a comissão (regime de caixa) sai sobre o
 * total. Caso real: venda 15678 (Germana, 30/06/2026), R$ 279,00 de comissão
 * em vez de R$ 111,60 — dado corrigido em prod 04/08/2026 (log 399).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockFetchPayment = vi.fn();
vi.mock("@/lib/mercado-pago", () => ({
  fetchPayment: (...args: unknown[]) => mockFetchPayment(...args),
}));

vi.mock("@/lib/saldo-credito", () => ({ creditarSaldo: vi.fn() }));

// Ownership tem teste próprio (auth-vendas); aqui não é o assunto.
vi.mock("@/lib/auth-vendas", () => ({
  requireCrediarioOwnership: vi.fn(async () => ({ vendedor_id: 2 })),
  NotFoundError: class NotFoundError extends Error {},
}));

const { POST } = await import("@/app/api/crediario/[id]/verificar-mp/route");

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID = "user-uuid-mp";
const CONTA_ID = 701;
const VENDA_ID = 30295;
const PAGAMENTO_ID = 1059;
const MP_ID = "MP-123456789";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/crediario/${CONTA_ID}/verificar-mp`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const makeParams = () => ({ params: Promise.resolve({ id: String(CONTA_ID) }) });

const sqlTexto = (call: unknown[]) =>
  Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? "");

/**
 * Enfileira as respostas do banco na ordem em que a rota consulta:
 * role → duplicata → conta → (MP) → pagamento A Receber → TX → crédito gerente.
 */
function setupQueries(opts: { contaValor: number; pagamentoValor: number; valorMp: number }) {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "t@t.com" } } });
  mockFetchPayment.mockResolvedValue({ status: "approved", transaction_amount: opts.valorMp });

  sqlMock.mockResolvedValueOnce([{ role: "admin" }]);          // SELECT role
  sqlMock.mockResolvedValueOnce([]);                            // guard duplicata gateway_id
  sqlMock.mockResolvedValueOnce([{                              // SELECT conta
    id: CONTA_ID, situacao: "pendente", valor: String(opts.contaValor),
    venda_erp_id: VENDA_ID, descricao: "Venda 15678 - parcela 1/4",
  }]);
  sqlMock.mockResolvedValueOnce([{                              // SELECT pagamento A Receber
    id: PAGAMENTO_ID, valor: String(opts.pagamentoValor),
  }]);

  sqlMock.begin.mockImplementation(async (cb: (tx: typeof sqlMock) => Promise<void>) => {
    await cb(sqlMock);
  });
  // Dentro da TX e depois dela tudo devolve vazio — a rota não lê esses retornos
  // (só o INSERT da conta nova, que devolve id).
  sqlMock.mockResolvedValue([{ id: 999, credito_gerente_usado: "0" }]);
}

describe("POST /api/crediario/[id]/verificar-mp — crediário parcelado", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
  });

  it("MP paga 1 parcela: DIVIDE o A Receber em vez de confirmar o crediário todo", async () => {
    // A Receber R$ 36.000 (4×), MP aprovou os R$ 9.000 da parcela 1/4.
    setupQueries({ contaValor: 9000, pagamentoValor: 36000, valorMp: 9000 });

    const res = await POST(makeRequest({ payment_id: MP_ID }), makeParams());
    expect(res.status).toBe(200);

    const updatePag = sqlMock.mock.calls.find((c) => {
      const t = sqlTexto(c);
      return t.includes("UPDATE") && t.includes("pagamentos_venda") && t.includes("valor");
    });
    const insertPag = sqlMock.mock.calls.find((c) => {
      const t = sqlTexto(c);
      return t.includes("INSERT") && t.includes("pagamentos_venda") && t.includes("A Receber");
    });

    expect(updatePag).toBeDefined();
    expect(updatePag).toContain(9000);   // confirmado = o que o MP aprovou
    expect(insertPag).toBeDefined();
    expect(insertPag).toContain(27000);  // resto do CREDIÁRIO segue pendente
  });

  it("reduz o confirmado ANTES de inserir o pendente (trava mig 333)", async () => {
    setupQueries({ contaValor: 9000, pagamentoValor: 36000, valorMp: 9000 });

    await POST(makeRequest({ payment_id: MP_ID }), makeParams());

    const idxUpdate = sqlMock.mock.calls.findIndex((c) => {
      const t = sqlTexto(c);
      return t.includes("UPDATE") && t.includes("pagamentos_venda") && t.includes("valor");
    });
    const idxInsert = sqlMock.mock.calls.findIndex((c) => {
      const t = sqlTexto(c);
      return t.includes("INSERT") && t.includes("pagamentos_venda") && t.includes("A Receber");
    });
    expect(idxUpdate).toBeGreaterThanOrEqual(0);
    expect(idxInsert).toBeGreaterThan(idxUpdate);
  });

  it("MP paga menos que a parcela: o resto é medido no A Receber, não na parcela", async () => {
    // A Receber R$ 36.000, parcela R$ 9.000, MP aprovou R$ 5.000.
    setupQueries({ contaValor: 9000, pagamentoValor: 36000, valorMp: 5000 });

    const res = await POST(makeRequest({ payment_id: MP_ID }), makeParams());
    const data = await res.json();

    const insertPag = sqlMock.mock.calls.find((c) => {
      const t = sqlTexto(c);
      return t.includes("INSERT") && t.includes("pagamentos_venda") && t.includes("A Receber");
    });
    expect(insertPag).toContain(31000);       // 36.000 − 5.000
    expect(data.pagamento_parcial).toBe(true); // a PARCELA ficou parcial (drawer)
    expect(data.valor_restante).toBe(4000);    // 9.000 − 5.000
  });

  it("crediário de 1 parcela: confirma o A Receber e não abre pendente", async () => {
    setupQueries({ contaValor: 9000, pagamentoValor: 9000, valorMp: 9000 });

    const res = await POST(makeRequest({ payment_id: MP_ID }), makeParams());
    const data = await res.json();

    const insertPag = sqlMock.mock.calls.find((c) => {
      const t = sqlTexto(c);
      return t.includes("INSERT") && t.includes("pagamentos_venda") && t.includes("A Receber");
    });
    expect(insertPag).toBeUndefined();
    expect(data.ok).toBe(true);
    expect(data.pagamento_parcial).toBeUndefined();
  });
});
