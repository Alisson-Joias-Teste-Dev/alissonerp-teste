/**
 * Testes da rota /api/financeiro/caixa/baixa (GET e POST)
 *
 * GET — listar baixas + pendentes
 *   1. 401 sem usuário
 *   2. Sucesso: retorna baixas + pendentes + total_pendente correto
 *   3. Lista vazia: total_pendente = 0
 *
 * POST — criar baixa
 *   4. 401 sem usuário
 *   5. 403 sem role (consultora) — verifica podedarBaixaCaixa
 *   6. 403 quando usuário não existe na tabela
 *   7. 400 quando não há pagamentos pendentes
 *   8. Sucesso: INSERT em fin_caixa_baixas + UPDATE em pagamentos_venda dentro de sql.begin
 *   9. Resposta inclui id, total, qtd_pagamentos, realizado_nome, created_at (status 201)
 *  10. Roles autorizadas: admin, desenvolvedor, gerente_loja, gerente_fabrica
 *  11. Body opcional `obs` (com e sem)
 *  12. Body inválido (JSON quebrado) — não derruba a rota (catch)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// sqlMock é uma função (template tag). Suporta `.begin(callback)` que invoca o
// callback passando o próprio sqlMock como "tx" — assim as queries dentro da
// transação consomem do mesmo mockResolvedValueOnce queue.
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
const { GET, POST } = await import("@/app/api/financeiro/caixa/baixa/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

function makeGetRequest() {
  return new NextRequest("http://localhost/api/financeiro/caixa/baixa", {
    method: "GET",
  });
}

function makePostRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/financeiro/caixa/baixa", init);
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("GET /api/financeiro/caixa/baixa", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  it.each(["consultora", "motoboy", "ourives", "pcp"])(
    "retorna 403 quando role é %s (GET agora exige role)",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role }]);
      const res = await GET(makeGetRequest());
      expect(res.status).toBe(403);
    },
  );

  it("retorna baixas, pendentes e total_pendente calculado", async () => {
    sqlMock
      // 1. SELECT role
      .mockResolvedValueOnce([{ role: "admin" }])
      // 2. baixas
      .mockResolvedValueOnce([
        { id: 2, total: "750.00", qtd_pagamentos: 3, realizado_nome: "João",  obs: null,    created_at: "2026-04-25 10:00:00" },
        { id: 1, total: "200.00", qtd_pagamentos: 1, realizado_nome: "Maria", obs: "teste", created_at: "2026-04-24 09:00:00" },
      ])
      // 3. pendentes
      .mockResolvedValueOnce([
        { id: 10, valor: "100.50", data_confirmacao: "2026-04-25 11:00:00", numero_venda: 555, venda_id: 50, vendedor_nome: "Ana" },
        { id: 11, valor: "250.00", data_confirmacao: "2026-04-25 12:00:00", numero_venda: 556, venda_id: 51, vendedor_nome: "Bia" },
        { id: 12, valor:  "49.50", data_confirmacao: "2026-04-25 13:00:00", numero_venda: 557, venda_id: 52, vendedor_nome: "Cris" },
      ]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.baixas).toHaveLength(2);
    expect(data.baixas[0].total).toBe(750); // convertido para Number
    expect(data.baixas[0].id).toBe(2);

    expect(data.pendentes).toHaveLength(3);
    expect(data.pendentes[0].valor).toBe(100.5);
    expect(data.pendentes[1].valor).toBe(250);
    expect(data.pendentes[2].valor).toBe(49.5);

    expect(data.total_pendente).toBeCloseTo(400, 2); // 100.5 + 250 + 49.5
  });

  it("query de baixas tem LIMIT 50", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    sqlMock.mockResolvedValue([]);
    await GET(makeGetRequest());

    const baixasCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("fin_caixa_baixas") && parts.includes("LIMIT");
    });
    expect(baixasCall).toBeDefined();
    const sqlText = (baixasCall![0] as string[]).join(" ");
    expect(sqlText).toMatch(/LIMIT\s+50/);
  });

  it("query de pendentes filtra forma=Dinheiro, status=confirmado, caixa_baixa_id IS NULL", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    sqlMock.mockResolvedValue([]);
    await GET(makeGetRequest());

    const pendentesCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("pagamentos_venda") && parts.includes("caixa_baixa_id");
    });
    expect(pendentesCall).toBeDefined();
    const sqlText = (pendentesCall![0] as string[]).join(" ");
    expect(sqlText).toMatch(/forma\s*=\s*'Dinheiro'/);
    expect(sqlText).toMatch(/status\s*=\s*'confirmado'/);
    expect(sqlText).toMatch(/caixa_baixa_id\s+IS\s+NULL/);
  });

  it("lista vazia: total_pendente = 0 e arrays vazios", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }]) // SELECT role
      .mockResolvedValueOnce([]) // baixas
      .mockResolvedValueOnce([]); // pendentes

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.baixas).toEqual([]);
    expect(data.pendentes).toEqual([]);
    expect(data.total_pendente).toBe(0);
  });

  it("converte total e valor para Number (mesmo vindo como string do pg)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }]) // SELECT role
      .mockResolvedValueOnce([
        { id: 1, total: "1234.56", qtd_pagamentos: 2, realizado_nome: "X", obs: null, created_at: "ts" },
      ])
      .mockResolvedValueOnce([
        { id: 5, valor: "10.10", data_confirmacao: null, numero_venda: 1, venda_id: 1, vendedor_nome: null },
      ]);

    const res = await GET(makeGetRequest());
    const data = await res.json();
    expect(typeof data.baixas[0].total).toBe("number");
    expect(data.baixas[0].total).toBe(1234.56);
    expect(typeof data.pendentes[0].valor).toBe("number");
    expect(data.pendentes[0].valor).toBe(10.1);
  });
});

describe("POST /api/financeiro/caixa/baixa", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "user@x.com" } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it("retorna 403 quando role não autorizada (consultora)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora", nome: "Ana" }]);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permissão/i);
  });

  it("retorna 403 quando usuário não existe na tabela usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]); // nenhum usuário encontrado

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/não encontrado/i);
  });

  it.each([
    ["admin"],
    ["desenvolvedor"],
    ["gerente_loja"],
    ["gerente_fabrica"],
  ])("aceita role autorizada: %s", async (role) => {
    sqlMock
      .mockResolvedValueOnce([{ role, nome: `User ${role}` }])
      // pendentes
      .mockResolvedValueOnce([{ id: 10, valor: "100.00" }])
      // INSERT (dentro de begin)
      .mockResolvedValueOnce([{
        id: 1, total: "100.00", qtd_pagamentos: 1,
        realizado_nome: `User ${role}`, obs: null, created_at: "2026-04-25 10:00",
      }])
      // UPDATE
      .mockResolvedValueOnce([]);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(201);
  });

  it.each([
    ["consultora"],
    ["motoboy"],
    ["pcp"],
    ["ourives"],
  ])("rejeita role não autorizada: %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role, nome: "X" }]);
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
  });

  // ── Sem pendentes ───────────────────────────────────────────────────────────

  it("retorna 400 quando não há pagamentos pendentes", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([]); // sem pendentes

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/nenhum pagamento/i);
    // sql.begin NÃO deve ter sido chamado
    expect(sqlMock.begin).not.toHaveBeenCalled();
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────

  it("sucesso: INSERT + UPDATE dentro de sql.begin e retorna 201 com payload", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "gerente_loja", nome: "Gerente" }])
      .mockResolvedValueOnce([
        { id: 100, valor: "300.00" },
        { id: 101, valor: "150.50" },
        { id: 102, valor: "49.50" },
      ])
      .mockResolvedValueOnce([{
        id: 7, total: "500.00", qtd_pagamentos: 3,
        realizado_nome: "Gerente", obs: null, created_at: "2026-04-25 11:00:00",
      }])
      .mockResolvedValueOnce([]); // UPDATE

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(201);

    // begin foi chamado uma vez
    expect(sqlMock.begin).toHaveBeenCalledTimes(1);

    const data = await res.json();
    expect(data).toEqual({
      id: 7,
      total: 500,
      qtd_pagamentos: 3,
      realizado_nome: "Gerente",
      created_at: "2026-04-25 11:00:00",
    });
  });

  it("INSERT recebe total correto (soma dos valores) e qtd_pagamentos correto", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([
        { id: 1, valor: "100.00" },
        { id: 2, valor: "250.50" },
        { id: 3, valor: "49.50" },
        { id: 4, valor: "100.00" },
      ])
      .mockResolvedValueOnce([{
        id: 9, total: "500.00", qtd_pagamentos: 4,
        realizado_nome: "Admin", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("fin_caixa_baixas");
    });
    expect(insertCall).toBeDefined();
    const values = insertCall!.slice(1) as unknown[];
    // total = 100 + 250.5 + 49.5 + 100 = 500
    expect(values).toContain(500);
    // qtd_pagamentos = 4
    expect(values).toContain(4);
  });

  it("UPDATE pagamentos_venda recebe os ids corretos e o id da nova baixa", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([
        { id: 33, valor: "10.00" },
        { id: 44, valor: "20.00" },
      ])
      .mockResolvedValueOnce([{
        id: 555, total: "30.00", qtd_pagamentos: 2,
        realizado_nome: "Admin", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    const updateCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("UPDATE") && parts.includes("pagamentos_venda")
        && parts.includes("caixa_baixa_id");
    });
    expect(updateCall).toBeDefined();
    const values = updateCall!.slice(1) as unknown[];
    expect(values).toContain(555); // id da baixa nova
    // ids pendentes (array)
    const idsArg = values.find(v => Array.isArray(v));
    expect(idsArg).toEqual([33, 44]);
  });

  it("query de pendentes filtra forma=Dinheiro, status=confirmado, caixa_baixa_id IS NULL", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([]); // sem pendentes — encerra antes do INSERT

    await POST(makePostRequest({}));

    const pendentesCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("pagamentos_venda")
        && parts.includes("caixa_baixa_id IS NULL")
        && parts.includes("'Dinheiro'");
    });
    expect(pendentesCall).toBeDefined();
    const sqlText = (pendentesCall![0] as string[]).join(" ");
    expect(sqlText).toMatch(/forma\s*=\s*'Dinheiro'/);
    expect(sqlText).toMatch(/status\s*=\s*'confirmado'/);
    expect(sqlText).toMatch(/caixa_baixa_id\s+IS\s+NULL/);
  });

  it("INSERT recebe obs quando enviado no body", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "Admin", obs: "Fechamento turno", created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({ obs: "Fechamento turno" }));

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("fin_caixa_baixas");
    });
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain("Fechamento turno");
  });

  it("INSERT recebe null quando obs ausente", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "Admin", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("fin_caixa_baixas");
    });
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain(null);
  });

  it("body inválido (JSON quebrado) não derruba a rota — segue como obs undefined", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Admin" }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "Admin", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    const req = makePostRequest("{ broken json");
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("INSERT usa o nome do usuário (não o email)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "Carlos Silva" }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "Carlos Silva", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("fin_caixa_baixas");
    });
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain("Carlos Silva");
    expect(values).not.toContain("user@x.com");
  });

  it("usa email como fallback quando usuario.nome é null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: null }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "user@x.com", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("fin_caixa_baixas");
    });
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain("user@x.com");
  });

  it("operação é transacional — INSERT e UPDATE rodam dentro de sql.begin", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin", nome: "A" }])
      .mockResolvedValueOnce([{ id: 1, valor: "10.00" }])
      .mockResolvedValueOnce([{
        id: 1, total: "10.00", qtd_pagamentos: 1,
        realizado_nome: "A", obs: null, created_at: "ts",
      }])
      .mockResolvedValueOnce([]);

    await POST(makePostRequest({}));

    expect(sqlMock.begin).toHaveBeenCalledTimes(1);
    // O callback recebido por begin deve ser uma function
    expect(typeof sqlMock.begin.mock.calls[0][0]).toBe("function");
  });
});
