/**
 * Testes ANTI-VOLTA da rota PATCH /api/tarefas/[id]/aprovacao
 * para o tipo 'frete_avulso' (BLOCO 1 — atomicidade + erro visível, jul/2026).
 *
 * O bug que este arquivo prova que NÃO acontece mais:
 *   1. A tarefa (aprovacoes_tarefa + tarefas) virava "aprovada"/"rejeitada"
 *      numa transação genérica; SÓ DEPOIS (fora dela, já commitada) rodava
 *      liberarFreteAvulso/recusarFreteAvulso — se essa ação de domínio
 *      falhasse, a tarefa ficava "aprovada" com a entrega ainda 'solicitada'
 *      (estado invisível — nenhuma tela lista entregas is_avulso='solicitada').
 *   2. Reenviar o mesmo PATCH (duplo-clique, retry, 2º aprovador concorrente)
 *      reprocessava a decisão inteira — no frete avulso isso lançaria o saldo
 *      da gerente em dobro.
 *
 * Verifica:
 *  1. Guard de idempotência: UPDATE de aprovacoes_tarefa não afeta linha
 *     (status já não é 'pendente') → 409, e a ação de domínio NUNCA roda.
 *  2. Atomicidade: quando a ação de domínio (liberarFreteAvulsoNoTx) lança,
 *     a rota devolve erro (não 200) e o caminho de sucesso (notificação,
 *     resposta ok:true) nunca é alcançado.
 *  3. A ação de domínio roda recebendo o MESMO `tx` da transação genérica
 *     (nunca abre a própria — isso é o que garante rollback único).
 *  4. Caminho feliz: aprova libera via NoTx recebendo o tx; rejeita exige
 *     motivo ANTES de qualquer escrita (nem a UPDATE genérica roda).
 *
 * LIMITAÇÃO DECLARADA: o mock de @/lib/db não mantém estado relacional
 * persistente entre chamadas (é baseado em retornos empilhados, como o resto
 * da suíte — ver aprovacao-desconto.test.ts). Por isso não dá pra afirmar
 * literalmente, através deste mock, que uma linha "tarefas.status" lida por
 * um SELECT populacional continua 'aguardando_aprovacao' depois do rollback
 * — isso é garantia do próprio driver postgres.js (se o callback de
 * `sql.begin` rejeita, a lib emite ROLLBACK na conexão; não é algo que o
 * nosso código precise reimplementar ou que valha a pena re-simular aqui).
 * O que ESTE arquivo prova, de forma equivalente e diretamente relevante à
 * regressão: (a) a ação de domínio é invocada com o MESMO objeto `tx` usado
 * pelas escritas genéricas (ou seja, dentro da MESMA transação — não abre
 * `sql.begin` própria) e (b) uma falha ali propaga como erro da rota inteira,
 * nunca como sucesso silencioso.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

/** Marca o valor de retorno de um UPDATE simulando o `.count` do postgres.js. */
function comContagem<T>(rows: T[], count: number): T[] {
  return Object.assign([...rows], { count });
}

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  begin: (fn: (tx: unknown) => unknown) => fn(sqlMock),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

/**
 * Camada de autoridade sempre "pode" — este arquivo testa ATOMICIDADE/GUARD,
 * não quem pode decidir (isso é src/lib/aprovacoes/__tests__/autoridade.test.ts).
 * eventoDaTarefa fica REAL (importOriginal) — é função pura, sem I/O, e o
 * bloco frete_avulso do route.ts depende do valor real dela.
 */
const mockPodeDecidir = vi.fn(async () => ({ pode: true }));
vi.mock("@/lib/aprovacoes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/aprovacoes")>()),
  podeDecidir: mockPodeDecidir,
}));

const mockLiberarFreteAvulsoNoTx = vi.fn();
const mockRecusarFreteAvulsoNoTx = vi.fn();
vi.mock("@/lib/entrega-venda", () => ({
  liberarFreteAvulsoNoTx: (...args: unknown[]) => mockLiberarFreteAvulsoNoTx(...args),
  recusarFreteAvulsoNoTx: (...args: unknown[]) => mockRecusarFreteAvulsoNoTx(...args),
}));

const mockCriarNotificacao = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/notificacoes", () => ({
  criarNotificacao: (...args: unknown[]) => mockCriarNotificacao(...args),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { PATCH } = await import("@/app/api/tarefas/[id]/aprovacao/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "aprovador-frete-uuid";
const TAREFA_ID = 10;
const APROVACAO_ID = 1;
const ENTREGA_ID = 55;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}/aprovacao`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: String(TAREFA_ID) }) };
}

/**
 * Sequência ANTES da transação (comum a todo PATCH de frete_avulso):
 *   1. SELECT * FROM aprovacoes_tarefa WHERE id = ... AND tarefa_id = ...
 *   2. SELECT role FROM usuarios (usuarioLogado)
 *   3. SELECT tarefaInfo (venda_id, tags, tipo, aprovacao_credito_tipo, venda_situacao)
 *   -- pré-checagem frete_avulso: podeDecidir (mockado, sem query própria) --
 */
function setupAntesDaTx() {
  sqlMock
    .mockResolvedValueOnce([{ id: APROVACAO_ID, tarefa_id: TAREFA_ID, aprovador_id: USER_ID, solicitante_id: "solicitante-uuid" }])
    .mockResolvedValueOnce([{ role: "gerente_loja" }])
    .mockResolvedValueOnce([{
      venda_id: null,
      tags: [],
      tipo: "frete_avulso",
      aprovacao_credito_tipo: null,
      venda_situacao: null,
    }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
  (sqlMock as unknown as { begin: (fn: (tx: unknown) => unknown) => unknown }).begin = (fn) => fn(sqlMock);
  sqlMock.mockResolvedValue([]);
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockPodeDecidir.mockResolvedValue({ pode: true });
  mockLiberarFreteAvulsoNoTx.mockResolvedValue(undefined);
  mockRecusarFreteAvulsoNoTx.mockResolvedValue(undefined);
});

describe("PATCH aprovacao — frete_avulso: guard de idempotência (item 1)", () => {
  it("2ª decisão sobre a mesma aprovação → 409, NÃO reprocessa (liberarFreteAvulsoNoTx nunca chamado)", async () => {
    setupAntesDaTx();
    // UPDATE aprovacoes_tarefa WHERE status='pendente' não afeta linha —
    // já foi decidida por outra requisição (corrida ou reenvio).
    sqlMock.mockResolvedValueOnce(comContagem([], 0));

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/já foi respondida/i);
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();
    expect(mockCriarNotificacao).not.toHaveBeenCalled();
  });
});

describe("PATCH aprovacao — frete_avulso: atomicidade da ação de domínio (item 2)", () => {
  it("liberarFreteAvulsoNoTx lança → rota devolve erro (não 200) e NÃO chega no caminho de sucesso", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))   // UPDATE aprovacoes_tarefa (guard OK)
      .mockResolvedValueOnce([])                   // fragmento tx`, concluida_em = now()`
      .mockResolvedValueOnce([])                   // UPDATE tarefas
      .mockResolvedValueOnce([])                   // INSERT tarefas_historico (processarDecisao)
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]); // SELECT entregas_venda pela tarefa

    mockLiberarFreteAvulsoNoTx.mockRejectedValueOnce(
      new Error("403 da config mudou no meio da corrida"),
    );

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    // internalError() nunca vaza err.message pro cliente — só confirma que
    // NÃO é 200/sucesso.
    expect(res.status).toBe(500);
    expect(data.error).not.toMatch(/liberado/i);
    // Nunca alcança a notificação/resposta de sucesso do bloco frete_avulso —
    // ANTES desta correção, essas 3 escritas genéricas já tinham COMMITADO
    // (tx própria, já resolvida) antes de a ação de domínio nem começar.
    expect(mockCriarNotificacao).not.toHaveBeenCalled();
  });

  it("recusarFreteAvulsoNoTx lança → rota devolve erro (não 200)", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1)) // UPDATE aprovacoes_tarefa (guard OK)
      .mockResolvedValueOnce([])                 // fragmento tx`` (vazio, decisao=rejeitado)
      .mockResolvedValueOnce([])                 // UPDATE tarefas
      .mockResolvedValueOnce([])                 // INSERT tarefas_historico
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]); // SELECT entregas_venda

    mockRecusarFreteAvulsoNoTx.mockRejectedValueOnce(new Error("erro de banco simulado"));

    const res = await PATCH(
      makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "rejeitado", motivo: "Corrida cara demais" }),
      makeParams(),
    );

    expect(res.status).toBe(500);
    expect(mockCriarNotificacao).not.toHaveBeenCalled();
  });
});

describe("PATCH aprovacao — frete_avulso: ação de domínio roda DENTRO da mesma tx (item 3)", () => {
  it("liberarFreteAvulsoNoTx recebe o MESMO objeto `tx` usado pelas escritas genéricas (não abre transação própria)", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]);

    await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());

    expect(mockLiberarFreteAvulsoNoTx).toHaveBeenCalledTimes(1);
    // 1º argumento é o `tx` — no mock de sql.begin, `tx` É o próprio sqlMock
    // (begin: (fn) => fn(sqlMock)). Se o código regredisse a chamar a função
    // pública (que abre sql.begin própria), este mock nem seria acionado —
    // route.ts importaria `liberarFreteAvulso`, não `liberarFreteAvulsoNoTx`.
    expect(mockLiberarFreteAvulsoNoTx).toHaveBeenCalledWith(sqlMock, ENTREGA_ID, USER_ID);
  });
});

describe("PATCH aprovacao — frete_avulso: caminho feliz e validações pré-tx (item 4)", () => {
  it("aprovado: libera via NoTx e responde ok com entrega_id", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]);

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.frete_avulso).toEqual({ entrega_id: ENTREGA_ID, decisao: "aprovado" });
    expect(mockLiberarFreteAvulsoNoTx).toHaveBeenCalledWith(sqlMock, ENTREGA_ID, USER_ID);
    expect(mockRecusarFreteAvulsoNoTx).not.toHaveBeenCalled();
    expect(mockCriarNotificacao).toHaveBeenCalledTimes(1);
  });

  it("rejeitado SEM motivo → 400 ANTES de qualquer escrita (nem a UPDATE genérica roda)", async () => {
    setupAntesDaTx();

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "rejeitado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/motivo/i);
    // Nenhuma chamada além das 3 pré-tx (aprovacao + role + tarefaInfo) —
    // a UPDATE genérica de aprovacoes_tarefa NUNCA chega a rodar.
    expect(sqlMock).toHaveBeenCalledTimes(3);
    expect(mockRecusarFreteAvulsoNoTx).not.toHaveBeenCalled();
  });

  it("rejeitado COM motivo: recusa via NoTx e responde ok", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]);

    const res = await PATCH(
      makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "rejeitado", motivo: "Sem motoboy disponível" }),
      makeParams(),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.frete_avulso).toEqual({ entrega_id: ENTREGA_ID, decisao: "rejeitado" });
    expect(mockRecusarFreteAvulsoNoTx).toHaveBeenCalledWith(sqlMock, ENTREGA_ID, USER_ID, "Sem motoboy disponível");
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();
  });

  it("entrega não encontrada pela tarefa → 404 (dentro da tx, tudo reverte)", async () => {
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // SELECT entregas_venda — nada encontrado

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/entrega de frete avulso não encontrada/i);
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();
    expect(mockCriarNotificacao).not.toHaveBeenCalled();
  });
});
