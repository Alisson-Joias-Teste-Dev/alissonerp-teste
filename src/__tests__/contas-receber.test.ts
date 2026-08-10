/**
 * Testes da rota /api/financeiro/contas-receber (GET e POST)
 *
 * GET — listar contas a receber
 *   1. 401 sem usuário
 *   2. 403 sem role financeiro
 *   3. Sucesso: retorna lista com campos esperados
 *   4. Filtro ?situacao=pendente aplica WHERE
 *   5. Filtro ?situacao=recebido aplica WHERE
 *   6. Sem filtro: não aplica WHERE situacao
 *   7. Ordenação por data_vencimento ASC NULLS LAST, created_at DESC
 *   8. LIMIT 200
 *
 * POST — criar conta a receber
 *   9. 401 sem usuário
 *  10. 403 sem role financeiro
 *  11. 400 sem descricao
 *  12. 400 sem valor
 *  13. 400 com valor <= 0
 *  14. Sucesso: INSERT retorna id e created_at
 *  15. Lookup automático de cliente_nome quando cliente_id informado
 *  16. cliente_id null/undefined: aceita sem lookup
 *  17. Campos opcionais salvos quando informados
 *  18. created_by = user.id
 *  19. venda_erp_id é aceito
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
const { GET, POST } = await import("@/app/api/financeiro/contas-receber/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-9999";

function makeGetRequest(query = "") {
  const url = `http://localhost/api/financeiro/contas-receber${query}`;
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/financeiro/contas-receber", init);
}

// Helper para juntar partes do template tag em texto
function sqlText(call: unknown[]): string {
  const parts = call[0] as string[];
  return parts.join(" ");
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("GET /api/financeiro/contas-receber", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it.each([
    ["consultora"],
    ["motoboy"],
    ["pcp"],
    ["ourives"],
  ])("retorna 403 quando role não autorizada: %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permissão/i);
  });

  it("retorna 403 quando usuário não existe na tabela usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]); // role lookup vazio
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it.each([
    ["admin"],
    ["desenvolvedor"],
    ["administrativo"],
    ["financeiro"],
    ["gerente_loja"],
    ["diretor"], // via isFullAccess
  ])("aceita role autorizada: %s", async (role) => {
    sqlMock
      .mockResolvedValueOnce([{ role }])
      .mockReturnValueOnce(undefined) // fragment sql`` (situacao ausente)
      .mockResolvedValueOnce([]); // contas vazias
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────

  it("retorna lista com campos esperados (valor convertido em Number, cliente_nome resolvido)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined) // fragment sql``
      .mockResolvedValueOnce([
        {
          id: 1,
          descricao: "Venda à vista",
          valor: "150.50",
          cliente_id: 10,
          cliente_nome: null,
          cliente_nome_ref: "Cliente A",
          situacao: "pendente",
          data_vencimento: "2026-05-01",
          created_at: "2026-04-25 10:00:00",
        },
        {
          id: 2,
          descricao: "Venda B",
          valor: "300.00",
          cliente_id: null,
          cliente_nome: "Cliente Manual",
          cliente_nome_ref: null,
          situacao: "recebido",
          data_vencimento: null,
          created_at: "2026-04-20 09:00:00",
        },
      ]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);

    expect(data[0].valor).toBe(150.5);
    expect(typeof data[0].valor).toBe("number");
    expect(data[0].cliente_nome).toBe("Cliente A"); // veio de cliente_nome_ref

    expect(data[1].valor).toBe(300);
    expect(data[1].cliente_nome).toBe("Cliente Manual"); // veio de cliente_nome
  });

  // ── Filtros ─────────────────────────────────────────────────────────────────

  it("filtro ?situacao=pendente aplica WHERE cr.situacao = 'pendente'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined) // fragment sql`AND cr.situacao = ${situacao}`
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest("?situacao=pendente"));

    // A última chamada é a de listagem
    const listCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("contas_receber"),
    );
    expect(listCall).toBeDefined();

    // O fragment AND cr.situacao = ${situacao} entra como subtag.
    // Postgres.js representa o tag pai como array de strings; o valor "pendente"
    // deve aparecer como argumento somewhere nas calls.
    const allArgs = sqlMock.mock.calls.flatMap((c) => c.slice(1));
    expect(allArgs).toContain("pendente");
  });

  it("filtro ?situacao=recebido aplica WHERE cr.situacao = 'recebido'", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined) // fragment sql`AND cr.situacao = ${situacao}`
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest("?situacao=recebido"));

    const allArgs = sqlMock.mock.calls.flatMap((c) => c.slice(1));
    expect(allArgs).toContain("recebido");
  });

  it("sem filtro: NÃO passa valor de situacao como argumento da query principal", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined) // fragment sql``
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    // Nenhum argumento deve ser "pendente"/"recebido"/"pago"
    const allArgs = sqlMock.mock.calls.flatMap((c) => c.slice(1));
    expect(allArgs).not.toContain("pendente");
    expect(allArgs).not.toContain("recebido");
    expect(allArgs).not.toContain("pago");
  });

  // ── Ordenação e LIMIT ───────────────────────────────────────────────────────

  it("query de listagem ordena por data_vencimento ASC NULLS LAST, created_at DESC", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const listCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("contas_receber"),
    );
    expect(listCall).toBeDefined();
    const txt = sqlText(listCall!);
    expect(txt).toMatch(/ORDER\s+BY[\s\S]*data_vencimento\s+ASC\s+NULLS\s+LAST/i);
    expect(txt).toMatch(/created_at\s+DESC/i);
  });

  it("query de listagem tem LIMIT 200", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const listCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("contas_receber"),
    );
    const txt = sqlText(listCall!);
    expect(txt).toMatch(/LIMIT\s+200/);
  });

  it("JOIN com public.contatos para resolver cliente_nome_ref", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockReturnValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await GET(makeGetRequest());

    const listCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("contas_receber"),
    );
    const txt = sqlText(listCall!);
    expect(txt).toMatch(/LEFT\s+JOIN\s+public\.contatos/i);
    expect(txt).toMatch(/id_contato\s*=\s*cr\.cliente_id/i);
  });
});

describe("POST /api/financeiro/contas-receber", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePostRequest({ descricao: "x", valor: 10 }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it.each([
    ["consultora"],
    ["motoboy"],
    ["pcp"],
    ["ourives"],
  ])("retorna 403 quando role não autorizada: %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await POST(makePostRequest({ descricao: "x", valor: 10 }));
    expect(res.status).toBe(403);
  });

  it("retorna 403 quando usuário não existe", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makePostRequest({ descricao: "x", valor: 10 }));
    expect(res.status).toBe(403);
  });

  it.each([
    ["admin"],
    ["desenvolvedor"],
    ["administrativo"],
    ["financeiro"],
    ["gerente_loja"],
  ])("aceita role autorizada: %s", async (role) => {
    sqlMock
      .mockResolvedValueOnce([{ role }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);
    const res = await POST(makePostRequest({ descricao: "Teste", valor: 50 }));
    expect(res.status).toBe(201);
  });

  // ── Validação ───────────────────────────────────────────────────────────────

  it("retorna 400 quando descricao ausente", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ valor: 10 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    // Onda 1J/1K: rota agora valida via zod → resposta padrao { error, issues }.
    expect(data.error).toBe("Dados invalidos");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("descricao"))).toBe(true);
  });

  it("descricao apenas espacos passa zod mas eh trimada antes do INSERT", async () => {
    // Onda 1K: zod min(1) aceita "   " — comportamento "rejeitar so-whitespace"
    // depende de .refine(s => s.trim().length > 0) que sera adicionado na Onda
    // 1L. Por agora validamos apenas que a string vai trimada pro DB.
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);
    const res = await POST(makePostRequest({ descricao: "   ", valor: 10 }));
    expect(res.status).toBe(201);
    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    expect(args).toContain("");
  });

  it("retorna 400 quando valor ausente", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "x" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dados invalidos");
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("valor"))).toBe(true);
  });

  it("retorna 400 quando valor === 0", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "x", valor: 0 }));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando valor negativo", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makePostRequest({ descricao: "x", valor: -50 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dados invalidos");
    expect(data.issues.some((i: { path: unknown[] }) => i.path.includes("valor"))).toBe(true);
  });

  // ── Sucesso básico ──────────────────────────────────────────────────────────

  it("sucesso: INSERT retorna id e created_at com status 201", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 42, created_at: "2026-04-25 10:00:00" }]);

    const res = await POST(makePostRequest({ descricao: "Conta X", valor: 250.5 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ id: 42, created_at: "2026-04-25 10:00:00" });
  });

  // ── Lookup cliente_nome ─────────────────────────────────────────────────────

  it("quando cliente_id informado, faz lookup em public.contatos e usa o nome retornado", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ nome: "Maria Silva" }]) // lookup
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "X", valor: 100, cliente_id: 77 }));

    // lookup query
    const lookupCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("contatos") && sqlText(c).includes("id_contato"),
    );
    expect(lookupCall).toBeDefined();
    expect(lookupCall!.slice(1)).toContain(77);

    // INSERT recebeu "Maria Silva"
    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    expect(insertCall).toBeDefined();
    const insertArgs = insertCall!.slice(1) as unknown[];
    expect(insertArgs).toContain("Maria Silva");
    expect(insertArgs).toContain(77); // cliente_id
  });

  it("quando cliente_id informado mas contato não existe, salva cliente_nome=null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]) // lookup vazio
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    const res = await POST(makePostRequest({ descricao: "X", valor: 100, cliente_id: 999 }));
    expect(res.status).toBe(201);

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const insertArgs = insertCall!.slice(1) as unknown[];
    // cliente_id=999 e cliente_nome=null
    expect(insertArgs).toContain(999);
    expect(insertArgs).toContain(null);
  });

  it("sem cliente_id: NÃO faz lookup e cliente_id=null no INSERT", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    const res = await POST(makePostRequest({ descricao: "X", valor: 100 }));
    expect(res.status).toBe(201);

    // Nenhum lookup em contatos
    const lookupCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("FROM public.contatos"),
    );
    expect(lookupCall).toBeUndefined();

    // Total de calls: 1 role + 1 INSERT = 2
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  // ── Campos opcionais ────────────────────────────────────────────────────────

  it("salva data_vencimento, categoria, obs e venda_erp_id quando informados", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(
      makePostRequest({
        descricao: "Conta completa",
        valor: 999.99,
        data_vencimento: "2026-06-30",
        categoria: "vendas",
        obs: "obs teste",
        venda_erp_id: 5555,
      }),
    );

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    expect(args).toContain("Conta completa");
    expect(args).toContain(999.99);
    expect(args).toContain("2026-06-30");
    expect(args).toContain("vendas");
    expect(args).toContain("obs teste");
    expect(args).toContain(5555);
  });

  it("campos opcionais ausentes são salvos como null", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "Mínimo", valor: 10 }));

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    // Conta quantos nulls há; deve haver pelo menos 5 (cliente_id, cliente_nome,
    // data_vencimento, categoria, obs, venda_erp_id) — todos null
    const nullCount = args.filter((a) => a === null).length;
    expect(nullCount).toBeGreaterThanOrEqual(5);
  });

  // ── created_by ──────────────────────────────────────────────────────────────

  it("created_by recebe user.id (uuid)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "X", valor: 1 }));

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    expect(args).toContain(USER_ID);
  });

  it("descricao é trimmed antes de salvar", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "  Espacos  ", valor: 10 }));

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    expect(args).toContain("Espacos");
    expect(args).not.toContain("  Espacos  ");
  });

  it("venda_erp_id é repassado como argumento", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, created_at: "ts" }]);

    await POST(makePostRequest({ descricao: "X", valor: 1, venda_erp_id: 12345 }));

    const insertCall = sqlMock.mock.calls.find((c) =>
      sqlText(c).includes("INSERT") && sqlText(c).includes("contas_receber"),
    );
    const args = insertCall!.slice(1) as unknown[];
    expect(args).toContain(12345);
  });
});
