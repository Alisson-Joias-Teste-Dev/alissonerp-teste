/**
 * Camada 2 (prevenção): submeterVendaParaAprovacaoCredito bloqueia o pedido de
 * aprovação de crédito quando o cliente não tem celular — antes de criar a
 * tarefa. Evita que a venda chegue ao approveVenda e fique presa em rascunho.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = Object.assign(vi.fn(), { array: (arr: unknown[]) => arr });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetSaldo = vi.fn();
vi.mock("@/lib/saldo-credito", () => ({ getSaldoDisponivel: mockGetSaldo }));
vi.mock("@/lib/vendas-aprovar", () => ({ approveVenda: vi.fn() }));
vi.mock("@/lib/aprovacao-regras", () => ({ getDescontoThreshold: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));

const { submeterVendaParaAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");

/** Roteia o sql mock por conteúdo: totais (com A Receber) + venda (com celular X). */
function routeSql(celular: unknown) {
  return (strings: unknown) => {
    const q = Array.isArray(strings) ? (strings as string[]).join(" ") : "";
    if (/a_receber_pendente/.test(q)) {
      return Promise.resolve([{ total_venda: 1000, confirmados: 0, a_receber_pendente: 500 }]);
    }
    if (/cliente_celular/.test(q)) {
      return Promise.resolve([{ id: 1, numero_venda: "9999", total_venda: 1000, total_comissao: 50, cliente_nome: "Fulano", cliente_celular: celular }]);
    }
    return Promise.resolve([]);
  };
}

describe("submeterVendaParaAprovacaoCredito — camada 2 (celular obrigatório)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
  });

  it("cliente SEM celular (null) → bloqueia com erro e NÃO cria tarefa", async () => {
    sqlMock.mockImplementation(routeSql(null));
    const r = await submeterVendaParaAprovacaoCredito(1, "user-uuid");
    expect(r.precisa_aprovacao).toBe(false);
    expect(r.erro).toMatch(/celular/i);
    expect(r.tarefa_id).toBeUndefined();
    expect(mockGetSaldo).not.toHaveBeenCalled(); // retornou antes do fluxo
  });

  it("celular só com espaços → também bloqueia (trim)", async () => {
    sqlMock.mockImplementation(routeSql("   "));
    const r = await submeterVendaParaAprovacaoCredito(1, "user-uuid");
    expect(r.erro).toMatch(/celular/i);
  });

  it("cliente COM celular → passa do gate (segue o fluxo)", async () => {
    sqlMock.mockImplementation(routeSql("85999990000"));
    // o gate de celular passa → chega no getSaldoDisponivel; usamos um sentinel
    // pra provar que NÃO bloqueou no celular.
    mockGetSaldo.mockRejectedValueOnce(new Error("GATE_PASSED"));
    await expect(submeterVendaParaAprovacaoCredito(1, "user-uuid")).rejects.toThrow("GATE_PASSED");
  });
});
