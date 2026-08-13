/**
 * Testes da rota /api/financeiro/conciliar (GET e POST)
 *
 * GET — sugestões automáticas de conciliação:
 *   - 401 sem usuário
 *   - Sem lançamentos pendentes: retorna total_nao_conciliados=0, sugestoes=[]
 *   - Lançamento débito (D): match em contas_pagar
 *   - Lançamento crédito (C): match em contas_receber
 *   - Algoritmo: tolerância de valor 1% + R$0.01, tolerância de data 3 dias, máx 3 matches
 *   - Lançamento sem match: NÃO aparece em sugestoes
 *
 * POST — confirmar conciliação manual:
 *   - 401 sem usuário
 *   - 403 quando role não tem full access (gerente_fabrica, gerente_loja, etc.)
 *   - 403 quando usuário não cadastrado em alissonerp.usuarios
 *   - 400 quando body inválido
 *   - 404 quando lançamento não existe
 *   - 409 quando lançamento já conciliado
 *   - Sucesso: INSERT em fin_conciliacoes (tipo='manual'), UPDATE lancamento, UPDATE conta
 *
 * NOTA: A rota POST faz queries sequenciais (sem sql.begin). Mockamos a chain
 * via mockResolvedValueOnce na ordem em que a rota executa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { GET, POST } = await import("@/app/api/financeiro/conciliar/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

function makePostRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/financeiro/conciliar", init);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/financeiro/conciliar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // Helper: mock SELECT role before user mocks
  function mockRole(role = "admin") {
    sqlMock.mockResolvedValueOnce([{ role }]);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await GET();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it.each(["consultora", "motoboy", "ourives", "pcp", "gerente_loja", "gerente_fabrica"])(
    "retorna 403 quando role é %s (GET agora exige fullAccess)",
    async (role) => {
      mockRole(role);
      const res = await GET();
      expect(res.status).toBe(403);
    },
  );

  // ── Sem lançamentos pendentes ─────────────────────────────────────────────

  it("sem lançamentos pendentes: retorna total_nao_conciliados=0 e sugestoes vazias", async () => {
    mockRole();
    sqlMock.mockResolvedValueOnce([]); // SELECT lancamentos
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_nao_conciliados).toBe(0);
    expect(data.sugestoes).toEqual([]);
  });

  it("sem lançamentos: NÃO consulta contas_pagar nem contas_receber", async () => {
    mockRole();
    sqlMock.mockResolvedValueOnce([]);
    await GET();
    // 1 SELECT role + 1 SELECT lancamentos = 2
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  // ── Match débito → contas_pagar ───────────────────────────────────────────

  it("lançamento débito (D): match com conta_pagar com mesmo valor e data próxima", async () => {
    const dataLanc = "2026-04-20";
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "x1", tipo: "D", valor: "100.00", data_transacao: dataLanc, descricao: "Pgto fornecedor" },
      ])
      .mockResolvedValueOnce([
        { id: 50, fornecedor_nome: "ACME", valor: "100.00", data_vencimento: "2026-04-21", descricao: "Boleto" },
      ])
      // valoresCredito vazio: rota NÃO consulta contas_receber
      ;
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total_nao_conciliados).toBe(1);
    expect(data.sugestoes).toHaveLength(1);
    expect(data.sugestoes[0].tipo_match).toBe("conta_pagar");
    expect(data.sugestoes[0].matches).toHaveLength(1);
    expect(data.sugestoes[0].matches[0].id).toBe(50);
    expect(data.sugestoes[0].matches[0].valor).toBe(100);
  });

  // ── Match crédito → contas_receber ────────────────────────────────────────

  it("lançamento crédito (C): match com conta_receber", async () => {
    const dataLanc = "2026-04-20";
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 2, fitid: "y1", tipo: "C", valor: "250.00", data_transacao: dataLanc, descricao: "Recebimento" },
      ])
      // valoresDebito vazio: rota NÃO consulta contas_pagar
      .mockResolvedValueOnce([
        { id: 90, cliente_nome: "Maria", valor: "250.00", data_vencimento: "2026-04-19", descricao: "Venda 123" },
      ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sugestoes).toHaveLength(1);
    expect(data.sugestoes[0].tipo_match).toBe("conta_receber");
    expect(data.sugestoes[0].matches[0].id).toBe(90);
    expect(data.sugestoes[0].matches[0].valor).toBe(250);
  });

  // ── Algoritmo de match ────────────────────────────────────────────────────

  it("algoritmo: aceita diferença de valor < 1% + R$0.01 (ex.: 100.00 vs 100.50)", async () => {
    // 100 * 0.01 + 0.01 = 1.01 → 0.50 < 1.01 → match
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.50", data_vencimento: "2026-04-20", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes[0].matches).toHaveLength(1);
  });

  it("algoritmo: REJEITA diferença de valor >= 1% + R$0.01 (ex.: 100.00 vs 102.00)", async () => {
    // 100 * 0.01 + 0.01 = 1.01 → 2.00 >= 1.01 → não bate
    // ANY com valor exato não traria 102 — então simulamos rota com valor "ANY" liberal
    // Mas como ANY usa o valor exato do lançamento, o DB nem retornaria 102.
    // Aqui força-se a vinda do match para testar o filtro JS:
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "102.00", data_vencimento: "2026-04-20", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    // Filtro JS deve descartar; sem matches, sugestão NÃO entra na lista
    expect(data.sugestoes).toHaveLength(0);
  });

  it("algoritmo: REJEITA diferença de data >= 3 dias (259200000 ms)", async () => {
    // 4 dias de diferença → rejeita
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: "2026-04-25", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes).toHaveLength(0);
  });

  it("algoritmo: ACEITA diferença de data < 3 dias (ex.: 2 dias)", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: "2026-04-22", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes[0].matches).toHaveLength(1);
  });

  it("algoritmo: limita matches a no máximo 3", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 1, fornecedor_nome: "A", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
        { id: 2, fornecedor_nome: "B", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
        { id: 3, fornecedor_nome: "C", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
        { id: 4, fornecedor_nome: "D", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
        { id: 5, fornecedor_nome: "E", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes[0].matches).toHaveLength(3);
  });

  it("lançamento sem match NÃO aparece em sugestoes (mas conta no total)", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([]); // contas_pagar sem match
    const res = await GET();
    const data = await res.json();
    expect(data.total_nao_conciliados).toBe(1);
    expect(data.sugestoes).toHaveLength(0);
  });

  it("data_transacao null não bloqueia o match (filtro de data ignorado)", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: null, descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: "2030-01-01", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes[0].matches).toHaveLength(1);
  });

  it("data_vencimento null no match: filtro de data ignorado, match passa", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: null, descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes[0].matches).toHaveLength(1);
  });

  it("converte valor (string numeric) para Number na resposta", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(typeof data.sugestoes[0].lancamento.valor).toBe("number");
    expect(typeof data.sugestoes[0].matches[0].valor).toBe("number");
  });

  it("mistura D e C: cada lançamento bate em sua tabela respectiva", async () => {
    mockRole();
    sqlMock
      .mockResolvedValueOnce([
        { id: 1, fitid: "a", tipo: "D", valor: "100.00", data_transacao: "2026-04-20", descricao: "" },
        { id: 2, fitid: "b", tipo: "C", valor: "200.00", data_transacao: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 11, fornecedor_nome: "X", valor: "100.00", data_vencimento: "2026-04-20", descricao: "" },
      ])
      .mockResolvedValueOnce([
        { id: 22, cliente_nome: "Y", valor: "200.00", data_vencimento: "2026-04-20", descricao: "" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data.sugestoes).toHaveLength(2);
    const tipos = data.sugestoes.map((s: { tipo_match: string }) => s.tipo_match).sort();
    expect(tipos).toEqual(["conta_pagar", "conta_receber"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/financeiro/conciliar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
    expect(res.status).toBe(401);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  // ── Permissão ─────────────────────────────────────────────────────────────

  it.each(["consultora", "motoboy", "ourives", "pcp", "gerente_fabrica", "gerente_loja"])(
    "retorna 403 quando role é %s (não tem full access)",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role }]); // SELECT role
      const res = await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
      expect(res.status).toBe(403);
    },
  );

  it("retorna 403 quando usuário não está cadastrado em alissonerp.usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]); // SELECT role vazio
    const res = await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
    expect(res.status).toBe(403);
  });

  it.each(["admin", "desenvolvedor", "diretor"])("aceita role %s (full access)", async (role) => {
    sqlMock
      .mockResolvedValueOnce([{ role }]) // SELECT role
      .mockResolvedValueOnce([{ id: 1, conciliado: false }]) // SELECT lancamento
      .mockResolvedValueOnce([]) // INSERT fin_conciliacoes
      .mockResolvedValueOnce([]) // UPDATE fin_lancamentos_bancarios
      .mockResolvedValueOnce([]); // UPDATE contas_pagar
    const res = await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
    expect(res.status).toBe(200);
  });

  // ── Validação de body ─────────────────────────────────────────────────────

  it("retorna 400 quando lancamento_id ausente", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ conta_pagar_id: 2 }));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando NEM conta_pagar_id NEM conta_receber_id presente", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ lancamento_id: 1 }));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando body está vazio", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  // ── Lançamento não existe / já conciliado ─────────────────────────────────

  it("retorna 404 quando lançamento não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]); // SELECT lancamento vazio
    const res = await POST(makePostRequest({ lancamento_id: 999, conta_pagar_id: 2 }));
    expect(res.status).toBe(404);
  });

  it("retorna 409 quando lançamento já conciliado", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, conciliado: true }]);
    const res = await POST(makePostRequest({ lancamento_id: 1, conta_pagar_id: 2 }));
    expect(res.status).toBe(409);
  });

  // ── Sucesso transacional (sem sql.begin — queries sequenciais) ────────────

  it("sucesso conta_pagar: INSERT fin_conciliacoes + UPDATE lancamento + UPDATE contas_pagar", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([]) // INSERT
      .mockResolvedValueOnce([]) // UPDATE lancamentos
      .mockResolvedValueOnce([]); // UPDATE contas_pagar
    const res = await POST(makePostRequest({ lancamento_id: 10, conta_pagar_id: 50 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });

    // Verifica que foram chamadas as 5 queries
    expect(sqlMock).toHaveBeenCalledTimes(5);

    // Inspeciona o INSERT (3ª chamada, índice 2)
    const insertCall = sqlMock.mock.calls[2];
    const insertSql = (insertCall[0] as string[]).join(" ");
    expect(insertSql).toMatch(/INSERT INTO.*fin_conciliacoes/i);
    // Tipo manual deve estar literal no SQL
    expect(insertSql).toMatch(/'manual'/);
    expect(insertSql).toMatch(/'confirmado'/);

    // UPDATE lancamento (4ª chamada)
    const updLancSql = (sqlMock.mock.calls[3][0] as string[]).join(" ");
    expect(updLancSql).toMatch(/UPDATE.*fin_lancamentos_bancarios/i);
    expect(updLancSql).toMatch(/conciliado\s*=\s*true/i);

    // UPDATE contas_pagar (5ª chamada)
    const updPagSql = (sqlMock.mock.calls[4][0] as string[]).join(" ");
    expect(updPagSql).toMatch(/UPDATE.*contas_pagar/i);
    expect(updPagSql).toMatch(/situacao\s*=\s*'pago'/i);
  });

  it("sucesso conta_receber: UPDATE em contas_receber com situacao='recebido'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([]) // INSERT
      .mockResolvedValueOnce([]) // UPDATE lancamentos
      .mockResolvedValueOnce([]); // UPDATE contas_receber
    const res = await POST(makePostRequest({ lancamento_id: 10, conta_receber_id: 77 }));
    expect(res.status).toBe(200);

    const updRecSql = (sqlMock.mock.calls[4][0] as string[]).join(" ");
    expect(updRecSql).toMatch(/UPDATE.*contas_receber/i);
    expect(updRecSql).toMatch(/situacao\s*=\s*'recebido'/i);
  });

  it("INSERT em fin_conciliacoes usa tipo='manual'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await POST(makePostRequest({ lancamento_id: 10, conta_pagar_id: 50 }));
    const insertSql = (sqlMock.mock.calls[2][0] as string[]).join(" ");
    expect(insertSql).toMatch(/'manual'/);
  });

  it("INSERT recebe lancamento_id, conta_pagar_id e null para conta_receber_id", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await POST(makePostRequest({ lancamento_id: 10, conta_pagar_id: 50 }));
    const insertCall = sqlMock.mock.calls[2];
    const values = insertCall.slice(1) as unknown[];
    expect(values).toContain(10);
    expect(values).toContain(50);
    expect(values).toContain(null);
  });

  it("conta_receber: INSERT recebe null para conta_pagar_id", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await POST(makePostRequest({ lancamento_id: 10, conta_receber_id: 77 }));
    const insertCall = sqlMock.mock.calls[2];
    const values = insertCall.slice(1) as unknown[];
    expect(values).toContain(10);
    expect(values).toContain(77);
    expect(values).toContain(null);
  });

  // ── Edge: ambos conta_pagar_id e conta_receber_id presentes ───────────────

  it("se ambos conta_pagar_id e conta_receber_id são enviados, atualiza AMBAS as tabelas", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 10, conciliado: false }])
      .mockResolvedValueOnce([]) // INSERT
      .mockResolvedValueOnce([]) // UPDATE lancamento
      .mockResolvedValueOnce([]) // UPDATE contas_pagar
      .mockResolvedValueOnce([]); // UPDATE contas_receber
    const res = await POST(
      makePostRequest({ lancamento_id: 10, conta_pagar_id: 50, conta_receber_id: 77 }),
    );
    expect(res.status).toBe(200);
    expect(sqlMock).toHaveBeenCalledTimes(6);

    const updPagSql = (sqlMock.mock.calls[4][0] as string[]).join(" ");
    expect(updPagSql).toMatch(/UPDATE.*contas_pagar/i);
    const updRecSql = (sqlMock.mock.calls[5][0] as string[]).join(" ");
    expect(updRecSql).toMatch(/UPDATE.*contas_receber/i);
  });
});
