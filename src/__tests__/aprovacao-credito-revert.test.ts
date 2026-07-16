/**
 * Testes da rota PATCH /api/tarefas/[id]/aprovacao — handler de CRÉDITO,
 * comportamento de "revert on failure" (fix do bug das vendas presas, ex.
 * 15545/15616).
 *
 * Regra: aprovar o crédito só "cola" quando a venda de fato é aprovada.
 *  1. approveVenda falhou (erro_aprovacao setado) → reverte a tarefa pra
 *     'aguardando_aprovacao' e retorna 409 com o erro real (reprocessável).
 *  2. venda aprovada de fato (venda_aprovada=true) → 200, SEM reverter.
 *  3. espera legítima por pagamento (venda_aprovada=false, SEM erro_aprovacao)
 *     → 200, SEM reverter (o crédito segue aprovado).
 *
 * O sql é mockado por CONTEÚDO da query (não por posição) pra ser robusto às
 * chamadas internas de processarDecisao / SELECT role no meio do fluxo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = "user-aprovador-uuid";

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: async (fn: (tx: unknown) => unknown) => fn(sqlMock),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockProcessarAprovacaoCredito = vi.fn();
vi.mock("@/lib/vendas-credito-aprovar", () => ({
  processarAprovacaoCredito: mockProcessarAprovacaoCredito,
}));

vi.mock("@/lib/devolucoes", () => ({
  processarAprovacaoDevolucao: vi.fn(),
  processarAprovacaoEstoqueDevolucao: vi.fn(),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { PATCH } = await import("@/app/api/tarefas/[id]/aprovacao/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(tarefaId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tarefas/${tarefaId}/aprovacao`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Roteia o sql mock pelo conteúdo da query — fluxo de crédito (venda ativa). */
function routeSqlByContent(strings: unknown) {
  const q = Array.isArray(strings) ? (strings as string[]).join(" ") : "";
  // 1ª leitura: a aprovação alvo
  if (/SELECT \* FROM alissonerp\.aprovacoes_tarefa/.test(q)) {
    return Promise.resolve([{ id: 1, tarefa_id: 10, aprovador_id: USER_ID, solicitante_id: "solicit-uuid" }]);
  }
  // tarefaInfo: dispara o handler de crédito (tipo diretor, venda em rascunho)
  if (/aprovacao_credito_tipo/.test(q) && /venda_situacao/.test(q)) {
    return Promise.resolve([{
      venda_id: 5,
      tags: ["credito_loja", "diretor"],
      tipo: null,
      aprovacao_credito_tipo: "diretor",
      venda_situacao: "rascunho",
    }]);
  }
  return Promise.resolve([]);
}

/** Verdadeiro se alguma chamada sql conteve a string literal procurada. */
function algumSqlContem(re: RegExp): boolean {
  return sqlMock.mock.calls.some((call) => {
    const parts = call[0];
    return Array.isArray(parts) && re.test((parts as string[]).join(" "));
  });
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("PATCH aprovacao — crédito: revert on failure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    // Restaura sql.begin(tx=>...) após reset — o PATCH agora envolve as escritas
    // genéricas numa transação (BUG 2, item c); o `tx` roteia pelo mesmo mock
    // por conteúdo (routeSqlByContent), então o comportamento não muda.
    (sqlMock as unknown as { begin: (fn: (tx: unknown) => unknown) => unknown }).begin = (fn) => fn(sqlMock);
    sqlMock.mockImplementation(routeSqlByContent);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("approveVenda falhou → reverte a tarefa e retorna 409 com o erro real", async () => {
    mockProcessarAprovacaoCredito.mockResolvedValueOnce({
      ok: true,
      acao: "aprovado",
      venda_aprovada: false,
      erro_aprovacao: "Cliente sem celular cadastrado. O código de entrega é enviado por WhatsApp...",
    });

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(mockProcessarAprovacaoCredito).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/celular/i);
    // reverteu a tarefa pra reprocessar
    expect(algumSqlContem(/aguardando_aprovacao/)).toBe(true);
  });

  it("venda aprovada de fato → 200 e NÃO reverte", async () => {
    mockProcessarAprovacaoCredito.mockResolvedValueOnce({
      ok: true,
      acao: "aprovado",
      venda_aprovada: true,
      message: "Crédito aprovado pelo diretor — Venda 15545 aprovada (comissão zerada)",
    });

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(mockProcessarAprovacaoCredito).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.credito).toBeDefined();
    expect(algumSqlContem(/aguardando_aprovacao/)).toBe(false);
  });

  it("espera legítima por pagamento (sem erro_aprovacao) → 200 e NÃO reverte", async () => {
    mockProcessarAprovacaoCredito.mockResolvedValueOnce({
      ok: true,
      acao: "aprovado",
      venda_aprovada: false, // ainda falta confirmar pagamento de entrada
      message: "Crédito aprovado — aguardando confirmação dos demais pagamentos da Venda 15545",
    });

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(algumSqlContem(/aguardando_aprovacao/)).toBe(false);
  });

  it("rejeição → não reverte (caminho normal)", async () => {
    mockProcessarAprovacaoCredito.mockResolvedValueOnce({
      ok: true,
      acao: "rejeitado",
      message: "Aprovação de crédito rejeitada",
    });

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "rejeitado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(algumSqlContem(/aguardando_aprovacao/)).toBe(false);
  });
});
