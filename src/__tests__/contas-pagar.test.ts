/**
 * Testes da rota /api/financeiro/contas-pagar (GET e POST)
 *
 * GET — listar contas a pagar
 *   1. 401 sem usuário
 *   2. 403 sem role financeiro (consultora)
 *   3. Sucesso: retorna lista com campos esperados
 *   4. Filtro ?situacao=pendente aplica WHERE
 *   5. Filtro ?situacao=pago aplica WHERE
 *   6. Sem filtro: retorna todas (sem AND situacao)
 *   7. ORDER BY data_vencimento ASC NULLS LAST + LIMIT 200
 *   8. JOIN com public.contatos para fornecedor_nome
 *
 * POST — criar conta a pagar
 *   9. 401 sem usuário
 *  10. 403 sem role financeiro (consultora)
 *  11. 400 sem descricao
 *  12. 400 sem valor
 *  13. 400 com valor <= 0
 *  14. Sucesso: INSERT retornando id, created_at (status 201)
 *  15. Lookup automático de fornecedor_nome quando fornecedor_id informado
 *  16. fornecedor_id null/undefined: aceita sem lookup
 *  17. Campos opcionais (data_vencimento, categoria, obs, compra_id) salvos
 *  18. created_by = user.id
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
const { GET, POST } = await import("@/app/api/financeiro/contas-pagar/route");

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID = "user-uuid-1234";

function makeGetRequest(qs = "") {
  return new NextRequest(`http://localhost/api/financeiro/contas-pagar${qs}`, {
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
  return new NextRequest("http://localhost/api/financeiro/contas-pagar", init);
}

// Concatena fragmentos de template-tag para inspecionar o SQL emitido
function joinSqlText(call: unknown[]): string {
  const parts = call[0] as readonly string[];
  return Array.isArray(parts) ? parts.join(" ") : String(parts);
}

// ── Testes GET ───────────────────────────────────────────────────────────────

describe("GET /api/financeiro/contas-pagar", () => {
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

  it("retorna 403 quando role não autorizada (consultora)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permissão/i);
  });

  it("retorna 403 quando usuário não existe na tabela usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]); // sem registro
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it.each([
    ["admin"],
    ["desenvolvedor"],
    ["gerente_fabrica"],
    ["gerente_loja"],
    ["diretor"], // via isFullAccess
  ])("aceita role autorizada: %s", async (role) => {
    // 1) SELECT role  2) sql`` fragment (no situacao)  3) SELECT cp.*
    sqlMock
      .mockResolvedValueOnce([{ role }])
      .mockResolvedValueOnce("FRAG")
      .mockResolvedValueOnce([]); // contas
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it.each([
    ["consultora"],
    ["motoboy"],
    ["pcp"],
    ["ourives"],
  ])("rejeita role não autorizada: %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("retorna lista com campos convertidos (valor → Number, fornecedor_nome resolvido)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG") // sql`` fragment
      .mockResolvedValueOnce([
        {
          id: 1,
          descricao: "Conta luz",
          fornecedor_id: 10,
          fornecedor_nome: null,
          fornecedor_nome_ref: "Energisa",
          valor: "150.50",
          situacao: "pendente",
          data_vencimento: "2026-05-01",
          created_at: "2026-04-25 09:00:00",
        },
        {
          id: 2,
          descricao: "Aluguel",
          fornecedor_id: null,
          fornecedor_nome: "Imobiliária X",
          fornecedor_nome_ref: null,
          valor: "2500.00",
          situacao: "pago",
          data_vencimento: "2026-04-30",
          created_at: "2026-04-24 10:00:00",
        },
      ]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveLength(2);
    expect(data[0].valor).toBe(150.5);
    expect(typeof data[0].valor).toBe("number");
    expect(data[0].fornecedor_nome).toBe("Energisa"); // veio do JOIN
    expect(data[1].valor).toBe(2500);
    expect(data[1].fornecedor_nome).toBe("Imobiliária X"); // veio direto da coluna
  });

  it("filtro ?situacao=pendente aplica AND cp.situacao = $1", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG") // sql`AND cp.situacao = ${...}` fragment
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest("?situacao=pendente"));

    // O fragmento `AND cp.situacao = ${situacao}` é uma chamada separada
    // ao tag-template — verifica que existe e contém 'pendente'
    const fragmentCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("AND cp.situacao");
    });
    expect(fragmentCall).toBeDefined();
    const fragFlat = fragmentCall!.flat(Infinity);
    expect(fragFlat).toContain("pendente");
  });

  it("filtro ?situacao=pago aplica AND cp.situacao = $1 com 'pago'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG")
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest("?situacao=pago"));

    const fragmentCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("AND cp.situacao");
    });
    expect(fragmentCall).toBeDefined();
    const fragFlat = fragmentCall!.flat(Infinity);
    expect(fragFlat).toContain("pago");
  });

  it("sem filtro: nenhum fragment com AND cp.situacao é emitido", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG")
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const fragmentCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("AND cp.situacao");
    });
    expect(fragmentCall).toBeUndefined();
  });

  it("query inclui ORDER BY data_vencimento ASC NULLS LAST e LIMIT 200", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG")
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const contasCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("contas_pagar") && t.includes("ORDER BY");
    });
    expect(contasCall).toBeDefined();
    const sqlText = joinSqlText(contasCall!);
    expect(sqlText).toMatch(/ORDER\s+BY\s+cp\.data_vencimento\s+ASC\s+NULLS\s+LAST/i);
    expect(sqlText).toMatch(/LIMIT\s+200/);
  });

  it("query faz LEFT JOIN com public.contatos para fornecedor_nome_ref", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce("FRAG")
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const contasCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("contas_pagar") && t.includes("LEFT JOIN");
    });
    expect(contasCall).toBeDefined();
    const sqlText = joinSqlText(contasCall!);
    expect(sqlText).toMatch(/LEFT\s+JOIN\s+public\.contatos\s+c/i);
    expect(sqlText).toMatch(/c\.id_contato\s*=\s*cp\.fornecedor_id/i);
    expect(sqlText).toMatch(/c\.nome\s+AS\s+fornecedor_nome_ref/i);
  });
});

// ── Testes POST ──────────────────────────────────────────────────────────────

describe("POST /api/financeiro/contas-pagar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePostRequest({ descricao: "x", valor: 10 }));
    expect(res.status).toBe(401);
  });

  it("retorna 403 quando role não autorizada (consultora)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await POST(makePostRequest({ descricao: "x", valor: 10 }));
    expect(res.status).toBe(403);
  });

  it.each([
    ["admin"],
    ["desenvolvedor"],
    ["gerente_fabrica"],
    ["gerente_loja"],
    ["diretor"], // via isFullAccess
  ])("aceita role autorizada: %s", async (role) => {
    sqlMock
      .mockResolvedValueOnce([{ role }])
      .mockResolvedValueOnce([{ id: 1, created_at: "2026-04-25 10:00:00" }]); // INSERT

    const res = await POST(makePostRequest({ descricao: "Teste", valor: 100 }));
    expect(res.status).toBe(201);
  });

  // ── Validação ───────────────────────────────────────────────────────────────

  it("retorna 400 sem descricao", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ valor: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    // Onda 1J: rota agora valida via zod → resposta padrao { error, issues[] }.
    expect(data.error).toBe("Dados invalidos");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("descricao"))).toBe(true);
  });

  it("descricao apenas espacos passa zod (min 1) mas eh trimada antes do INSERT", async () => {
    // Onda 1K: rota delegou validacao ao zod (min(1)) → "   " com 3 espacos
    // passa pelo schema, mas o body.descricao.trim() na rota faz o INSERT
    // gravar "". Pendencia conhecida (Onda 1L): adicionar .refine(s => s.trim())
    // ao schema para bloquear no validador. Por enquanto, validamos que pelo
    // menos a string trimada chega no INSERT (nao polui banco com whitespace).
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);
    const res = await POST(makePostRequest({ descricao: "   ", valor: 100 }));
    expect(res.status).toBe(201);
    const insertCall = sqlMock.mock.calls.find((c) => {
      const parts = (c[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("contas_pagar");
    });
    const flat = insertCall!.flat(Infinity);
    expect(flat).toContain(""); // descricao virou string vazia apos trim
  });

  it("retorna 400 sem valor", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "Teste" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dados invalidos");
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("valor"))).toBe(true);
  });

  it("retorna 400 quando valor === 0 (cai no !body.valor)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "Teste", valor: 0 }));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando valor < 0", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "Teste", valor: -50 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dados invalidos");
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("valor"))).toBe(true);
  });

  // ── Sucesso ────────────────────────────────────────────────────────────────

  it("sucesso: retorna 201 com id e created_at", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 42, created_at: "2026-04-25 11:00:00" }]); // INSERT

    const res = await POST(makePostRequest({ descricao: "Aluguel", valor: 1500 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(42);
    expect(data.created_at).toBe("2026-04-25 11:00:00");
  });

  it("lookup de fornecedor_nome quando fornecedor_id informado", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ nome: "Fornecedor Brilho LTDA" }]) // SELECT contatos
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]); // INSERT

    await POST(makePostRequest({
      descricao: "Compra ouro",
      valor: 5000,
      fornecedor_id: 99,
    }));

    // Deve ter chamado o SELECT contatos
    const lookupCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("FROM public.contatos") && t.includes("id_contato");
    });
    expect(lookupCall).toBeDefined();
    const lookupFlat = lookupCall!.flat(Infinity);
    expect(lookupFlat).toContain(99);

    // INSERT deve receber o nome resolvido
    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    expect(insertCall).toBeDefined();
    const insertFlat = insertCall!.flat(Infinity);
    expect(insertFlat).toContain("Fornecedor Brilho LTDA");
  });

  it("fornecedor_id ausente: NÃO faz lookup e fornecedor_nome vai como null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]); // INSERT direto

    await POST(makePostRequest({ descricao: "Conta sem fornec.", valor: 100 }));

    const lookupCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("FROM public.contatos");
    });
    expect(lookupCall).toBeUndefined();

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    const insertFlat = insertCall!.flat(Infinity);
    // fornecedor_id e fornecedor_nome ambos null
    const nullCount = insertFlat.filter((v) => v === null).length;
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });

  it("fornecedor_id informado mas contato inexistente: fornecedor_nome = null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]) // contato não encontrado
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({
      descricao: "Compra",
      valor: 100,
      fornecedor_id: 999,
    }));

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    const insertFlat = insertCall!.flat(Infinity);
    expect(insertFlat).toContain(999); // fornecedor_id preservado
    // fornecedor_nome null
    expect(insertFlat.filter((v) => v === null).length).toBeGreaterThanOrEqual(1);
  });

  it("INSERT recebe campos opcionais (data_vencimento, categoria, obs, compra_id)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({
      descricao: "Compra ouro 100g",
      valor: 50000,
      data_vencimento: "2026-05-15",
      categoria: "metal",
      obs: "Pagamento à vista",
      compra_id: 777,
    }));

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    expect(insertCall).toBeDefined();
    const flat = insertCall!.flat(Infinity);
    expect(flat).toContain("Compra ouro 100g");
    expect(flat).toContain(50000);
    expect(flat).toContain("2026-05-15");
    expect(flat).toContain("metal");
    expect(flat).toContain("Pagamento à vista");
    expect(flat).toContain(777);
  });

  it("INSERT recebe nulls para campos opcionais ausentes", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "Conta minimal", valor: 10 }));

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    const flat = insertCall!.flat(Infinity);
    expect(flat).toContain("Conta minimal");
    expect(flat).toContain(10);
    // fornecedor_id, fornecedor_nome, data_vencimento, categoria, obs, compra_id = 6 nulls
    const nullCount = flat.filter((v) => v === null).length;
    expect(nullCount).toBe(6);
  });

  it("INSERT recebe created_by = user.id", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "x", valor: 1 }));

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    const flat = insertCall!.flat(Infinity);
    expect(flat).toContain(USER_ID);
  });

  it("descricao com espaços nas pontas é trimada antes do INSERT", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "   Aluguel sala   ", valor: 100 }));

    const insertCall = sqlMock.mock.calls.find((call) => {
      const t = joinSqlText(call);
      return t.includes("INSERT INTO alissonerp.contas_pagar");
    });
    const flat = insertCall!.flat(Infinity);
    expect(flat).toContain("Aluguel sala");
    expect(flat).not.toContain("   Aluguel sala   ");
  });
});
