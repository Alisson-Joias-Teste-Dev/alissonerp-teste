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

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Devolucoes mock
vi.mock("@/lib/devolucoes", () => ({
  processarAprovacaoDevolucao: vi.fn(),
}));

/**
 * Camada de autoridade (PR #97). Sem este mock, `podeDecidir` vai ao banco
 * mockado, não acha config, devolve `nao_configurado` → o PATCH corta em 403 e
 * NENHUM handler roda. Era esse o motivo de 11 testes deste arquivo estarem
 * vermelhos desde a PR #97 — e do teste do UUID estar VERDE afirmando sobre a
 * query errada (ele buscava `mock.calls[5]` por posição, e o UPDATE de
 * vendas_erp nem chegava a ser chamado).
 *
 * Aqui a autoridade é sempre "pode": o objetivo deste arquivo é o que o handler
 * de desconto ESCREVE, não quem pode decidir (isso é testado em
 * src/lib/aprovacoes/__tests__/autoridade.test.ts).
 */
vi.mock("@/lib/aprovacoes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/aprovacoes")>()),
  podeDecidir: vi.fn(async () => ({ pode: true })),
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
 * Configura sql para o fluxo base ATUAL do PATCH (Fase 7):
 *   1. SELECT * FROM aprovacoes_tarefa WHERE id = ... AND tarefa_id = ...
 *   2. SELECT role FROM usuarios WHERE id = ...             (usuarioLogado)
 *   3. SELECT t.venda_id, t.tags, t.tipo, ve.aprovacao_credito_tipo,
 *      ve.situacao AS venda_situacao FROM tarefas ...        (tarefaInfo)
 *   -- gate de permissão (sem query própria quando o usuário é o aprovador
 *      gravado — é o caso destes testes, USER_ID === aprovador_id) --
 *   4. tx UPDATE aprovacoes_tarefa SET status = ...
 *   5. tx`` fragmento condicional (concluida_em ou vazio) — consumido ANTES
 *      do UPDATE tarefas por ser avaliado como argumento do template
 *   6. tx UPDATE tarefas SET status = ...
 *   7. tx INSERT tarefas_historico (processarDecisao, dentro da MESMA
 *      transação — BUG 2 item c)
 *
 * IMPORTANTE: `tipo` precisa vir preenchido (default "desconto_acima") —
 * sem ele o handler de desconto (route.ts, `tarefaInfo?.tipo ===
 * "desconto_acima"`) nunca roda, porque o roteamento é por TIPO, não pela
 * tag (ver comentário "BUG FIX (jun/2026)" no route.ts).
 */
function setupBase(
  tagsArg: string[] | string,
  vendaId: number | null = null,
  tipo: string | null = "desconto_acima",
  extra: { aprovacao_credito_tipo?: string | null; venda_situacao?: string | null } = {},
) {
  sqlMock
    // 1. SELECT * FROM aprovacoes_tarefa WHERE id = ... AND tarefa_id = ...
    .mockResolvedValueOnce([{ id: 1, tarefa_id: 10, aprovador_id: USER_ID, solicitante_id: "solicit-uuid" }])
    // 2. SELECT role FROM usuarios WHERE id = ... (usuarioLogado)
    .mockResolvedValueOnce([{ role: "gerente" }])
    // 3. SELECT tarefaInfo (venda_id, tags, tipo, aprovacao_credito_tipo, venda_situacao)
    .mockResolvedValueOnce([{
      venda_id: vendaId,
      tags: tagsArg,
      tipo,
      aprovacao_credito_tipo: extra.aprovacao_credito_tipo ?? null,
      venda_situacao: extra.venda_situacao ?? null,
    }])
    // 4. tx UPDATE aprovacoes_tarefa SET status = ...
    .mockResolvedValueOnce([])
    // 5. tx`` fragmento (concluida_em ou vazio) — consumido antes do UPDATE tarefas
    .mockResolvedValueOnce([])
    // 6. tx UPDATE tarefas SET status = ...
    .mockResolvedValueOnce([])
    // 7. tx INSERT tarefas_historico (processarDecisao)
    .mockResolvedValueOnce([]);
}

/** Todas as chamadas sql cujo texto casa com o regex — busca por CONTEÚDO. */
function acharChamadasSql(re: RegExp): unknown[][] {
  return sqlMock.mock.calls.filter((c) => {
    const partes = c[0];
    return Array.isArray(partes) && re.test((partes as string[]).join(" "));
  });
}

/** Verdadeiro se alguma chamada sql conteve a string/regex procurada. */
function algumSqlContem(re: RegExp): boolean {
  return acharChamadasSql(re).length > 0;
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("PATCH aprovacao — hook aprovacao_desconto", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restaura propriedade de fragment após reset
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    // Restaura sql.begin(tx=>...) após reset — o PATCH agora envolve as escritas
    // genéricas numa transação (BUG 2, item c); sem isto o mock não tem `.begin`.
    (sqlMock as unknown as { begin: (fn: (tx: unknown) => unknown) => unknown }).begin = (fn) => fn(sqlMock);
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
      .mockResolvedValueOnce([])                                    // 8. UPDATE vendas_erp (limpa lock + grava aprovador)
      .mockResolvedValueOnce([])                                    // 9. UPDATE itens_venda_erp (comissão 0,5%)
      .mockResolvedValueOnce([{ solicitante_id: "solicit-uuid" }]) // 10. SELECT solicitante_id
      .mockResolvedValueOnce([]);                                   // 11. INSERT notificacoes
      // 12. INSERT webhook_log cai no default (mockResolvedValue([]))

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.desconto).toEqual({ decisao: "aprovado" });
    // setupBase (7: aprovacoes_tarefa + role + tarefaInfo + tx[4]) + UPDATE vendas_erp
    // + UPDATE itens + SELECT solicitante + INSERT notificacoes + INSERT webhook_log = 12
    expect(sqlMock).toHaveBeenCalledTimes(12);
  });

  it("rejeição: limpa lock mas NÃO altera situacao nem comissão", async () => {
    setupBase(["aprovacao_desconto"], 5);
    sqlMock
      .mockResolvedValueOnce([])                                    // 8. UPDATE vendas_erp (limpa lock apenas)
      .mockResolvedValueOnce([])                                    // 9. SELECT cartão vinculado (cascata) — nenhum
      .mockResolvedValueOnce([{ solicitante_id: "solicit-uuid" }]) // 10. SELECT solicitante_id
      .mockResolvedValueOnce([]);                                   // 11. INSERT notificacoes
      // 12. INSERT webhook_log cai no default (mockResolvedValue([]))

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "rejeitado" }), makeParams("10"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.desconto).toEqual({ decisao: "rejeitado" });
    // mesmo total da aprovação: onde ela tem o UPDATE itens_venda_erp, a rejeição
    // tem a checagem de cascata do cartão (SELECT em vendas_erp) — 12 chamadas.
    expect(sqlMock).toHaveBeenCalledTimes(12);
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

  /**
   * Acha a chamada do UPDATE de vendas_erp pelo CONTEÚDO, não pela posição.
   *
   * Era `sqlMock.mock.calls[5]` — índice cravado. Qualquer query a mais/a menos
   * antes dela (foi o que aconteceu na Fase 7, ao subir o SELECT da tarefa pra
   * antes do portão de permissão) fazia o índice apontar pra outra chamada, e o
   * teste passava a afirmar coisa sobre o UPDATE errado. Um dos dois testes já
   * estava vermelho na main por isso; o outro passava por coincidência.
   */
  function acharUpdateVendasErp(): unknown[] {
    const call = sqlMock.mock.calls.find((c) => {
      const partes = c[0];
      if (!Array.isArray(partes)) return false;
      const texto = partes.join(" ");
      return /UPDATE\s+alissonerp\.vendas_erp/i.test(texto) && /desconto_aprovado_por/.test(texto);
    });
    if (!call) throw new Error("UPDATE alissonerp.vendas_erp (desconto) não foi chamado");
    return call as unknown[];
  }

  /** Variante da rejeição: mesmo UPDATE, mas SEM os campos de aprovação (só limpa o lock). */
  function acharUpdateVendasErpRejeicao(): unknown[] {
    const call = sqlMock.mock.calls.find((c) => {
      const partes = c[0];
      if (!Array.isArray(partes)) return false;
      const texto = partes.join(" ");
      return (
        /UPDATE\s+alissonerp\.vendas_erp/i.test(texto) &&
        /aprovacao_desconto_tarefa_id/.test(texto) &&
        !/desconto_aprovado_por/.test(texto)
      );
    });
    if (!call) throw new Error("UPDATE alissonerp.vendas_erp (desconto, rejeição) não foi chamado");
    return call as unknown[];
  }

  function acharUpdateItensVendaErp(): unknown[] {
    const call = sqlMock.mock.calls.find((c) => {
      const partes = c[0];
      if (!Array.isArray(partes)) return false;
      const texto = partes.join(" ");
      return /UPDATE\s+alissonerp\.itens_venda_erp/i.test(texto);
    });
    if (!call) throw new Error("UPDATE alissonerp.itens_venda_erp não foi chamado");
    return call as unknown[];
  }

  it("aprovação: UPDATE vendas_erp NÃO inclui mudança de situacao", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    const sqlParts: string = (acharUpdateVendasErp()[0] as string[]).join(" ");
    expect(sqlParts).not.toMatch(/situacao/i);
    expect(sqlParts).toMatch(/aprovacao_desconto_tarefa_id/);
    expect(sqlParts).toMatch(/desconto_aprovado_por/);
    expect(sqlParts).toMatch(/desconto_aprovado_em/);
  });

  it("aprovação: UPDATE vendas_erp recebe o UUID do aprovador como parâmetro", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    // Interpolated values incluem user.id (USER_ID) como parâmetro após os strings
    const interpolated = acharUpdateVendasErp().slice(1) as string[];
    expect(interpolated).toContain(USER_ID);
  });

  /**
   * REESCRITO: a versão anterior deste teste ("pct_comissao = 0.5 e * 0.005")
   * afirmava a regra ANTIGA — TODO desconto acima do teto zerava a comissão pra
   * um fixo de 0,5% (via `* 0.005`). Essa regra não existe mais no código: o
   * route.ts (comentário "jul/2026 — correção") mudou pra usar a TABELA DE
   * FAIXAS (faixas_comissao) pelo desconto real de cada item — só quem tem
   * desconto > 30% cai no fixo de 0,5%; os demais usam fc.comissao_pct via
   * LEFT JOIN. Ver getComissao() do front pra mesma fonte única.
   */
  it("aprovação: UPDATE itens_venda_erp recalcula comissão pela tabela de faixas (fallback 0,5% só acima de 30%)", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    const sqlParts: string = (acharUpdateItensVendaErp()[0] as string[]).join(" ");
    expect(sqlParts).toMatch(/itens_venda_erp/);
    expect(sqlParts).toMatch(/pct_comissao/);
    expect(sqlParts).toMatch(/valor_comissao/);
    expect(sqlParts).toMatch(/faixas_comissao/);
    // fallback fixo só para item com desconto > 30% — não mais para toda a venda
    expect(sqlParts).toMatch(/desconto\s*>\s*30\s+THEN\s+0\.5/i);
    // demais itens seguem a tabela de faixas (fc.comissao_pct), não um * 0.005 fixo
    expect(sqlParts).toMatch(/comissao_pct/);
  });

  /**
   * O desconto da comissão sai dos PREÇOS, nunca de `pct_desconto`.
   *
   * O PORQUÊ (03/08/2026): `pct_desconto` mente no item promocional — ele mede
   * contra o preço já promocional, dá ~0% e joga o item na faixa cheia de 4%
   * onde a tabela mandava 0,50%. Custou R$ 575,61 em julho/2026. A base certa é
   * `preco_lista_cheio` (migration 366), o preço original da campanha.
   */
  it("aprovação: o desconto da comissão vem de preco_lista_cheio, não de pct_desconto", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    const sqlParts: string = (acharUpdateItensVendaErp()[0] as string[]).join(" ");
    expect(sqlParts).toMatch(/preco_lista_cheio/);
    // COALESCE com preco_lista cobre linha antiga com a coluna ainda nula
    expect(sqlParts).toMatch(/COALESCE\(\s*i\.preco_lista_cheio,\s*i\.preco_lista\s*\)/i);
    // pct_desconto NÃO pode ser a base da comissão neste UPDATE
    expect(sqlParts).not.toMatch(/pct_desconto/);
  });

  /**
   * Aliança e peça personalizada NÃO entram no recálculo.
   *
   * O PORQUÊ (decisão do Jonathan, 03/08/2026): a comissão delas vem do módulo
   * de orçamento, que calcula pelo PESO — "não é bug, é do módulo de orçamento
   * de alianças". Elas nunca têm `produto_id` (117 itens desde 01/05/2026, todos
   * desses dois tipos). Sem este filtro, aprovar um desconto numa venda que
   * tenha aliança substitui a comissão da aliança pela faixa.
   */
  it("aprovação: NÃO recalcula item sem produto_id (aliança e peça personalizada)", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));

    const sqlParts: string = (acharUpdateItensVendaErp()[0] as string[]).join(" ");
    expect(sqlParts).toMatch(/produto_id\s+IS\s+NOT\s+NULL/i);
  });

  it("rejeição: UPDATE vendas_erp NÃO inclui mudança de situacao nem comissão", async () => {
    setupBase(["aprovacao_desconto"], 5);

    await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "rejeitado" }), makeParams("10"));

    const sqlParts: string = (acharUpdateVendasErpRejeicao()[0] as string[]).join(" ");
    expect(sqlParts).not.toMatch(/situacao/i);
    expect(sqlParts).not.toMatch(/pct_comissao/);
    expect(sqlParts).toMatch(/aprovacao_desconto_tarefa_id/);

    // A rejeição NUNCA deve tocar itens_venda_erp (comissão só muda na aprovação)
    expect(algumSqlContem(/itens_venda_erp/i)).toBe(false);
  });
});

describe("PATCH aprovacao — regressão: hook de crédito ainda funciona sem tag desconto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockProcessarAprovacaoCredito.mockResolvedValue({ ok: true });
  });

  it("tarefa com venda_id e SEM tag aprovacao_desconto aciona processarAprovacaoCredito", async () => {
    // REESCRITO: a versão anterior usava a tag "aprovacao_venda" pra representar
    // "tag diferente de desconto" — mas essa tag é EXCLUÍDA de propósito da rota
    // de crédito real (route.ts ~701-708 e evento-da-tarefa.ts ~94: "Exclui:
    // aprovacao_venda (notificação genérica)"). Com ela, o teste estaria
    // afirmando uma regra que já não existe (créditos NUNCA rodam com essa tag).
    // Troca pra uma tag neutra + tipo=null (nem desconto_acima, nem cartao_desconto)
    // e informa aprovacao_credito_tipo/venda_situacao — dados que o handler de
    // crédito real exige (isCreditoReal) e que o setupBase antigo nunca preenchia.
    setupBase(["outra_tag"], 7, null, { aprovacao_credito_tipo: "gerente", venda_situacao: "rascunho" });

    const res = await PATCH(makeRequest("10", { aprovacao_id: 1, decisao: "aprovado" }), makeParams("10"));
    const data = await res.json();

    expect(mockProcessarAprovacaoCredito).toHaveBeenCalledWith(10, USER_ID, "aprovado", undefined);
    expect(data.credito).toBeDefined();
  });

  it("tarefa SEM venda_id e SEM tag desconto não aciona crédito nem desconto", async () => {
    setupBase([], null, null); // sem venda_id, sem tipo
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
