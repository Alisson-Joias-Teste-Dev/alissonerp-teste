/**
 * Testes da rota PATCH /api/tarefas/[id]/aprovacao
 * para o hook de aprovação de desconto (tag "aprovacao_desconto").
 *
 * Verifica:
 *  1. Aprovação libera o lock (NÃO muda situacao — venda segue como rascunho)
 *  2. Aprovação registra desconto_aprovado_por com id do aprovador
 *  3. Aprovação atualiza comissão dos itens para 0,5%
 *  4. Rejeição limpa lock mas NÃO toca situacao nem comissão
 *  5. Tag aprovacao_desconto NUNCA aciona o hook de crédito
 *  6. Tarefa sem tag aprovacao_desconto AINDA aciona o hook de crédito (regressão)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), { array: (arr: unknown[]) => arr });
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

// Devolucoes mock
vi.mock("@/lib/devolucoes", () => ({
  processarAprovacaoDevolucao: vi.fn(),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { PATCH } = await import("@/app/api/tarefas/[id]/aprovacao/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-aprovador-uuid";

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

/**
 * Configura sql para o fluxo base (SELECT aprovacao + 2× UPDATE + SELECT tarefaInfo).
 *
 * O UPDATE tarefas usa um template SQL condicional:
 *   ${decisao === "aprovado" ? sql`, concluida_em = now()` : sql``}
 * Isso chama sqlMock como "fragment" ANTES do UPDATE real, consumindo 1 slot extra.
 * Por isso precisamos de 5 mocks, não 4.
 */
function setupBase(tagsArg: string[] | string, vendaId: number | null = null) {
  sqlMock
    // 1. SELECT * FROM aprovacoes_tarefa WHERE id = ...
    .mockResolvedValueOnce([{ id: 1, tarefa_id: 10, aprovador_id: USER_ID, solicitante_id: "solicit-uuid" }])
    // 2. UPDATE aprovacoes_tarefa SET status = ...
    .mockResolvedValueOnce([])
    // 3. sql`` fragment (concluida_em ou vazio) — consumido antes do UPDATE tarefas
    .mockResolvedValueOnce([])
    // 4. UPDATE tarefas SET status = ... WHERE id = ...
    .mockResolvedValueOnce([])
    // 5. SELECT venda_id, tags FROM tarefas WHERE id = ...
    .mockResolvedValueOnce([{ venda_id: vendaId, tags: tagsArg }]);
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("PATCH aprovacao — hook aprovacao_desconto", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restaura propriedade de fragment após reset
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    // Default seguro: queries sem mock específico retornam array vazio
    sqlMock.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem aprovacao_id ou decisao", async () => {
    const res = await PATCH(makeRequest("10", { aprovacao_id: 1 }), makeParams("10"));
    expect(res.status).toBe(400);
  });

  it("retorna 403 quando usuário não é o aprovador", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 1, tarefa_id: 10, aprovador_id: "outro-uuid", solicitante_id: "x" }]);
    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    expect(res.status).toBe(403);
  });

  it("aprovação: libera o lock e atualiza comissão para 0,5%", async () => {
    setupBase(["aprovacao_desconto"], 5);
    sqlMock
      .mockResolvedValueOnce([])                                    // 6. UPDATE vendas_erp (limpa lock + grava aprovador)
      .mockResolvedValueOnce([])                                    // 7. UPDATE itens_venda_erp (comissão 0,5%)
      .mockResolvedValueOnce([{ solicitante_id: "solicit-uuid" }]) // 8. SELECT solicitante_id
      .mockResolvedValueOnce([]);                                   // 9. INSERT notificacoes

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.desconto).toEqual({ decisao: "aprovado" });
    // setupBase(5) + 2 UPDATEs + SELECT + INSERT + 1 chamada extra (validação adicionada em commit posterior) = 10 total
    expect(sqlMock).toHaveBeenCalledTimes(10);
  });

  it("rejeição: limpa lock mas NÃO altera situacao nem comissão", async () => {
    setupBase(["aprovacao_desconto"], 5);
    sqlMock
      .mockResolvedValueOnce([])                                    // 6. UPDATE vendas_erp (limpa lock apenas)
      .mockResolvedValueOnce([{ solicitante_id: "solicit-uuid" }]) // 7. SELECT solicitante_id
      .mockResolvedValueOnce([]);                                   // 8. INSERT notificacoes

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "rejeitado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.desconto).toEqual({ decisao: "rejeitado" });
    // setupBase(5) + 1 UPDATE + SELECT + INSERT + 1 chamada extra (validação adicionada em commit posterior) = 9 total
    expect(sqlMock).toHaveBeenCalledTimes(9);
  });

  it("tag aprovacao_desconto NUNCA aciona o hook de crédito", async () => {
    setupBase(["aprovacao_desconto"], 5);
    sqlMock
      .mockResolvedValueOnce([])                        // UPDATE vendas_erp
      .mockResolvedValueOnce([])                        // UPDATE itens (comissão 0,5%)
      .mockResolvedValueOnce([{ solicitante_id: "x" }])
      .mockResolvedValueOnce([]);                       // INSERT notificacoes

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    expect(mockProcessarAprovacaoCredito).not.toHaveBeenCalled();
  });

  it("tags com formato string bruto do PG também funciona: '{aprovacao_desconto}'", async () => {
    setupBase("{aprovacao_desconto}", 5);
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])                        // UPDATE itens (comissão 0,5%)
      .mockResolvedValueOnce([{ solicitante_id: "x" }])
      .mockResolvedValueOnce([]);

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.desconto).toBeDefined();
    expect(mockProcessarAprovacaoCredito).not.toHaveBeenCalled();
  });

  it("aprovação: UPDATE vendas_erp NÃO inclui mudança de situacao", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    // Call index 5 (0-based) é o UPDATE vendas_erp após setupBase(5 slots)
    const updateVendasCall = sqlMock.mock.calls[5];
    const sqlParts: string = (updateVendasCall[0] as string[]).join(" ");
    expect(sqlParts).not.toMatch(/situacao/i);
    expect(sqlParts).toMatch(/aprovacao_credito_tarefa_id/);
    expect(sqlParts).toMatch(/desconto_aprovado_por/);
    expect(sqlParts).toMatch(/desconto_aprovado_em/);
  });

  it("aprovação: UPDATE vendas_erp recebe o UUID do aprovador como parâmetro", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    const updateVendasArgs = sqlMock.mock.calls[5];
    // Interpolated values incluem user.id (USER_ID) como primeiro parâmetro após os strings
    const interpolated = updateVendasArgs.slice(1) as string[];
    expect(interpolated).toContain(USER_ID);
  });

  it("aprovação: UPDATE itens_venda_erp usa pct_comissao = 0.5 e * 0.005", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    // Call index 6 é o UPDATE itens_venda_erp
    const updateItensCall = sqlMock.mock.calls[6];
    const sqlParts: string = (updateItensCall[0] as string[]).join(" ");
    expect(sqlParts).toMatch(/pct_comissao/);
    expect(sqlParts).toMatch(/0\.5/);
    expect(sqlParts).toMatch(/0\.005/);
    expect(sqlParts).toMatch(/itens_venda_erp/);
  });

  it("rejeição: UPDATE vendas_erp NÃO inclui mudança de situacao nem comissão", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "rejeitado" }), makeParams("10"));

    // Call index 5 é o UPDATE vendas_erp de rejeição
    const updateVendasCall = sqlMock.mock.calls[5];
    const sqlParts: string = (updateVendasCall[0] as string[]).join(" ");
    expect(sqlParts).not.toMatch(/situacao/i);
    expect(sqlParts).not.toMatch(/pct_comissao/);
    expect(sqlParts).toMatch(/aprovacao_credito_tarefa_id/);

    // Call index 6 é o SELECT solicitante — NÃO deve ser UPDATE itens
    const nextCall = sqlMock.mock.calls[6];
    const nextSql: string = (nextCall[0] as string[]).join(" ");
    expect(nextSql).not.toMatch(/itens_venda_erp/);
  });
});

describe("PATCH aprovacao — regressão: hook de crédito ainda funciona sem tag desconto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockProcessarAprovacaoCredito.mockResolvedValue({ ok: true });
  });

  it("tarefa com venda_id e SEM tag aprovacao_desconto aciona processarAprovacaoCredito", async () => {
    setupBase(["aprovacao_venda"], 7); // tag diferente, venda vinculada

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(mockProcessarAprovacaoCredito).toHaveBeenCalledWith(10, USER_ID, "aprovado", undefined);
    expect(data.credito).toBeDefined();
  });

  it("tarefa SEM venda_id e SEM tag desconto não aciona crédito nem desconto", async () => {
    setupBase([], null); // sem venda_id
    sqlMock
      .mockResolvedValueOnce([])   // SELECT devolucoes_venda
      .mockResolvedValueOnce([]);  // INSERT notificacoes

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockProcessarAprovacaoCredito).not.toHaveBeenCalled();
    expect(data.desconto).toBeUndefined();
    expect(data.credito).toBeUndefined();
  });
});
