/**
 * Testes ANTI-VOLTA da rota PATCH /api/tarefas/[id]/aprovacao para o tipo
 * 'frete_avulso' (BLOCO 2, jul/2026 — autorização NÃO-manipulável).
 *
 * Cobre os 2 problemas do BLOCO 2:
 *
 *  P1 — auto-aprovação: quem solicita o frete avulso NÃO pode decidir o
 *    próprio pedido, mesmo quando (por coincidência) é o `aprovador_id`
 *    GRAVADO em aprovacoes_tarefa (1º UUID do pool no momento da criação —
 *    ver criarFreteAvulso, src/lib/entrega-venda.ts). Outro aprovador do
 *    mesmo pool decide normalmente. Mensagem clara (não "Sem permissão"
 *    genérico) quando o motivo é especificamente esse.
 *
 *  P2 — pool decidido pelo DADO, não pela tag: mesmo que `tarefas.tags`
 *    contenha (ou não) `frete_pagante:loja`, quem decide o evento
 *    (frete_avulso x frete_avulso_loja) é `entregas_venda.pagante`
 *    (`tarefaInfo.frete_pagante`, join feito pela própria rota) — a tag é
 *    ignorada por eventoDaTarefa (real, não mockado aqui — função pura).
 *
 * Estratégia de mock: `podeDecidir` é substituído por uma implementação FAKE
 * mas FIEL à regra de segregação real (filtra ctx.solicitanteId do pool antes
 * de decidir) — o que este arquivo prova é que a ROTA passa ctx.solicitanteId
 * nos dois pontos certos (portão genérico + pré-checagem) e monta a mensagem
 * certa a partir do `motivo` devolvido. A regra de exclusão em si (autoridade.ts)
 * tem teste próprio, com DB mockado de verdade, em
 * src/lib/aprovacoes/__tests__/autoridade-solicitante.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

function comContagem<T>(rows: T[], count: number): T[] {
  return Object.assign([...rows], { count });
}

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
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
 * Pool configurado dos testes — mutável por teste via `setPool()`.
 * Reimplementa a MESMA regra de segregação de src/lib/aprovacoes/autoridade.ts
 * (exclui ctx.solicitanteId do pool antes de decidir) — não é a implementação
 * real (essa é testada à parte, com DB mockado, em autoridade-solicitante.test.ts),
 * é um dublê fiel pra provar que a ROTA invoca podeDecidir com o ctx certo e
 * monta a mensagem certa a partir do `motivo`.
 */
let poolFreteAvulso: string[] = [];
function setPool(uuids: string[]) {
  poolFreteAvulso = uuids;
}

const mockPodeDecidir = vi.fn(async (
  user: { id: string },
  evento: string,
  ctx?: { solicitanteId?: string },
) => {
  let pool = [...poolFreteAvulso];
  // Espelha solicitantePodeAprovar do catálogo (31/07): 'frete_avulso_loja'
  // NÃO exclui o solicitante do pool — só o irmão 'frete_avulso' (cliente).
  const excluiSolicitante = evento !== "frete_avulso_loja";
  if (ctx?.solicitanteId && excluiSolicitante) pool = pool.filter((id) => id !== ctx.solicitanteId);
  if (pool.length === 0) {
    return { pode: false, motivo: ctx?.solicitanteId && excluiSolicitante ? "aprovador_e_o_proprio_solicitante" : "aprovador_nao_configurado" };
  }
  return pool.includes(user.id) ? { pode: true } : { pode: false, motivo: "nao_e_aprovador_configurado" };
});
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

const TAREFA_ID = 20;
const APROVACAO_ID = 2;
const ENTREGA_ID = 77;
const SOLICITANTE_E_APROVADOR_GRAVADO = "solicitante-e-aprovador-uuid";
const OUTRO_APROVADOR = "outro-aprovador-uuid";

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
 * `aprovador_id` gravado é o MESMO uuid do solicitante — reproduz o cenário
 * real do bug: criarFreteAvulso grava aprovador_id = listaAprovadoresFrete[0],
 * que pode coincidir com quem está solicitando se essa pessoa estiver no pool.
 */
function setupAntesDaTx(opts: { fretePagante?: "loja" | "cliente" | null; tags?: string[] } = {}) {
  sqlMock
    .mockResolvedValueOnce([{
      id: APROVACAO_ID,
      tarefa_id: TAREFA_ID,
      aprovador_id: SOLICITANTE_E_APROVADOR_GRAVADO,
      solicitante_id: SOLICITANTE_E_APROVADOR_GRAVADO,
    }])
    .mockResolvedValueOnce([{ role: "gerente_loja" }])
    .mockResolvedValueOnce([{
      venda_id: null,
      tags: opts.tags ?? [],
      tipo: "frete_avulso",
      aprovacao_credito_tipo: null,
      venda_situacao: null,
      frete_pagante: opts.fretePagante ?? null,
    }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
  (sqlMock as unknown as { begin: (fn: (tx: unknown) => unknown) => unknown }).begin = (fn) => fn(sqlMock);
  sqlMock.mockResolvedValue([]);
  mockLiberarFreteAvulsoNoTx.mockResolvedValue(undefined);
  mockRecusarFreteAvulsoNoTx.mockResolvedValue(undefined);
  setPool([]);
});

describe("P1 — auto-aprovação: quem solicita não decide o próprio frete avulso", () => {
  it("pool com 1 pessoa só (a solicitante, também gravada como aprovador_id) → 403 com MENSAGEM CLARA, ação de domínio NUNCA roda", async () => {
    setPool([SOLICITANTE_E_APROVADOR_GRAVADO]);
    mockGetUser.mockResolvedValue({ data: { user: { id: SOLICITANTE_E_APROVADOR_GRAVADO } } });
    setupAntesDaTx();

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/você solicitou este frete avulso/i);
    expect(data.error).not.toBe("Sem permissão");
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();
    expect(mockCriarNotificacao).not.toHaveBeenCalled();

    // Prova que a rota PASSOU ctx.solicitanteId pro portão genérico —
    // sem isso o mock devolveria pode:true (aprovador_id gravado = quem chamou,
    // e o pool "sem ctx" continuaria tendo essa pessoa).
    expect(mockPodeDecidir).toHaveBeenCalledWith(
      expect.objectContaining({ id: SOLICITANTE_E_APROVADOR_GRAVADO }),
      "frete_avulso",
      expect.objectContaining({ solicitanteId: SOLICITANTE_E_APROVADOR_GRAVADO }),
    );
  });

  it("pool com 2 pessoas: solicitante (aprovador_id gravado) tenta decidir → 403; OUTRO aprovador do MESMO pool decide normalmente", async () => {
    setPool([SOLICITANTE_E_APROVADOR_GRAVADO, OUTRO_APROVADOR]);

    mockGetUser.mockResolvedValue({ data: { user: { id: SOLICITANTE_E_APROVADOR_GRAVADO } } });
    setupAntesDaTx();
    const resSolicitante = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    expect(resSolicitante.status).toBe(403);
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();

    vi.clearAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    (sqlMock as unknown as { begin: (fn: (tx: unknown) => unknown) => unknown }).begin = (fn) => fn(sqlMock);
    sqlMock.mockResolvedValue([]);
    mockLiberarFreteAvulsoNoTx.mockResolvedValue(undefined);

    mockGetUser.mockResolvedValue({ data: { user: { id: OUTRO_APROVADOR } } });
    setupAntesDaTx();
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1)) // UPDATE aprovacoes_tarefa (guard OK)
      .mockResolvedValueOnce([])                 // fragmento tx`, concluida_em = now()`
      .mockResolvedValueOnce([])                 // UPDATE tarefas
      .mockResolvedValueOnce([])                 // INSERT tarefas_historico
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]); // SELECT entregas_venda pela tarefa

    const resOutro = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const dataOutro = await resOutro.json();

    expect(resOutro.status).toBe(200);
    expect(dataOutro.ok).toBe(true);
    expect(mockLiberarFreteAvulsoNoTx).toHaveBeenCalledWith(sqlMock, ENTREGA_ID, OUTRO_APROVADOR);
  });
});

describe("P2 — pool decidido pelo DADO (entregas_venda.pagante), não pela tag", () => {
  it("tag frete_pagante:loja presente, mas o DADO diz pagante='cliente' → evento continua 'frete_avulso' (chave aprovadores_frete_avulso)", async () => {
    setPool([OUTRO_APROVADOR]);
    mockGetUser.mockResolvedValue({ data: { user: { id: OUTRO_APROVADOR } } });
    setupAntesDaTx({ fretePagante: "cliente", tags: ["aprovacao_frete_avulso", "frete_pagante:loja"] });
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]);

    await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());

    // eventoDaTarefa é REAL (importOriginal) — se a tag ainda mandasse, o
    // evento seria 'frete_avulso_loja'. Prova que o dado manda.
    expect(mockPodeDecidir).toHaveBeenCalledWith(
      expect.anything(),
      "frete_avulso",
      expect.anything(),
    );
  });

  it("SEM a tag, mas o DADO diz pagante='loja' → evento vira 'frete_avulso_loja' (chave aprovadores_frete_avulso_loja)", async () => {
    setPool([OUTRO_APROVADOR]);
    mockGetUser.mockResolvedValue({ data: { user: { id: OUTRO_APROVADOR } } });
    setupAntesDaTx({ fretePagante: "loja", tags: ["aprovacao_frete_avulso"] });
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]);

    await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());

    expect(mockPodeDecidir).toHaveBeenCalledWith(
      expect.anything(),
      "frete_avulso_loja",
      expect.anything(),
    );
  });
});

describe("P3 — auto-aprovação PERMITIDA no frete pago pela LOJA (31/07, decisão do Jonathan)", () => {
  it("pagante='loja': quem solicitou (e está no pool aprovadores_frete_avulso_loja) aprova o PRÓPRIO frete → 200, ação de domínio roda", async () => {
    setPool([SOLICITANTE_E_APROVADOR_GRAVADO]);
    mockGetUser.mockResolvedValue({ data: { user: { id: SOLICITANTE_E_APROVADOR_GRAVADO } } });
    setupAntesDaTx({ fretePagante: "loja" });
    sqlMock
      .mockResolvedValueOnce(comContagem([], 1)) // UPDATE aprovacoes_tarefa (guard OK)
      .mockResolvedValueOnce([])                 // fragmento tx`, concluida_em = now()`
      .mockResolvedValueOnce([])                 // UPDATE tarefas
      .mockResolvedValueOnce([])                 // INSERT tarefas_historico
      .mockResolvedValueOnce([{ id: ENTREGA_ID }]); // SELECT entregas_venda pela tarefa

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockLiberarFreteAvulsoNoTx).toHaveBeenCalledWith(sqlMock, ENTREGA_ID, SOLICITANTE_E_APROVADOR_GRAVADO);
  });

  it("ANTI-VOLTA: pagante='cliente' com o MESMO cenário (solicitante = aprovador gravado) segue 403 — a liberação é só da loja", async () => {
    setPool([SOLICITANTE_E_APROVADOR_GRAVADO]);
    mockGetUser.mockResolvedValue({ data: { user: { id: SOLICITANTE_E_APROVADOR_GRAVADO } } });
    setupAntesDaTx({ fretePagante: "cliente" });

    const res = await PATCH(makeRequest({ aprovacao_id: APROVACAO_ID, decisao: "aprovado" }), makeParams());

    expect(res.status).toBe(403);
    expect(mockLiberarFreteAvulsoNoTx).not.toHaveBeenCalled();
  });
});
