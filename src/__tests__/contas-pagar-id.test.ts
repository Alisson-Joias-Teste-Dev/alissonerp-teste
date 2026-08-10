/**
 * Testes da rota PATCH /api/financeiro/contas-pagar/[id]
 *
 * A rota foi corrigida (v2.31.10) com:
 *   - Checagem de role financeiro
 *   - SELECT da conta antes do UPDATE → retorna 404 se não existe
 *   - Bloqueio quando há pagamento Inter ativo (409)
 *   - Auto-fill de data_pagamento quando situacao='pago' e data_pagamento ausente
 *   - RETURNING id no UPDATE → 404 se conta foi deletada entre SELECT e UPDATE
 *
 * Nota: GET, PUT e DELETE NÃO existem (apenas PATCH é exportado).
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
const routeModule = await import(
  "@/app/api/financeiro/contas-pagar/[id]/route"
);
const PATCH = routeModule.PATCH;
const GET = (routeModule as Record<string, unknown>).GET;
const PUT = (routeModule as Record<string, unknown>).PUT;
const DELETE = (routeModule as Record<string, unknown>).DELETE;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

function makePatchRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/financeiro/contas-pagar/123", init);
}

const makeParams = (id: string | number) =>
  ({ params: Promise.resolve({ id: String(id) }) });

/**
 * Helper que monta o pipeline padrão de mocks para uma chamada PATCH bem-sucedida:
 *   1. SELECT role from usuarios → role autorizada
 *   2. SELECT id, situacao, inter_status from contas_pagar → conta existe
 *   3. UPDATE ... RETURNING id → 1 linha afetada
 */
function mockHappyPath(opts?: {
  role?: string;
  conta?: { id?: number; situacao?: string; inter_status?: string | null };
  updateRows?: Array<{ id: number }>;
}) {
  sqlMock
    .mockResolvedValueOnce([{ role: opts?.role ?? "admin" }]) // SELECT role
    .mockResolvedValueOnce([{
      id: opts?.conta?.id ?? 1,
      situacao: opts?.conta?.situacao ?? "pendente",
      inter_status: opts?.conta?.inter_status ?? null,
    }]) // SELECT conta
    .mockResolvedValueOnce(opts?.updateRows ?? [{ id: opts?.conta?.id ?? 1 }]); // UPDATE RETURNING id
}

// ── Sanidade de exports ───────────────────────────────────────────────────────

describe("Exports do módulo /api/financeiro/contas-pagar/[id]", () => {
  it("exporta PATCH", () => {
    expect(typeof PATCH).toBe("function");
  });

  it("não exporta GET (não implementado)", () => {
    expect(GET).toBeUndefined();
  });

  it("não exporta PUT (não implementado)", () => {
    expect(PUT).toBeUndefined();
  });

  it("não exporta DELETE (não implementado)", () => {
    expect(DELETE).toBeUndefined();
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/financeiro/contas-pagar/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(makePatchRequest({}), makeParams(1));
    expect(res.status).toBe(401);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await PATCH(makePatchRequest({}), makeParams(1));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it.each([
    "consultora",
    "motoboy",
    "ourives",
    "pcp",
    "estoquista_loja",
  ])("retorna 403 quando role é %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(403);
  });

  it("retorna 403 quando usuário não está cadastrado em alissonerp.usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(403);
  });

  it.each([
    "desenvolvedor",
    "admin",
    "administrativo",
    "financeiro",
    "gerente_loja",
  ])("aceita role %s", async (role) => {
    mockHappyPath({ role });
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(200);
  });

  // ── Validação de ID ─────────────────────────────────────────────────────────

  it("retorna 400 quando id não é numérico", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await PATCH(makePatchRequest({}), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando id é string vazia", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await PATCH(makePatchRequest({}), makeParams(""));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando id é zero", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await PATCH(makePatchRequest({}), makeParams(0));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando id é negativo", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await PATCH(makePatchRequest({}), makeParams(-5));
    expect(res.status).toBe(400);
  });

  // ── Conta não encontrada ────────────────────────────────────────────────────

  it("retorna 404 quando conta não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]); // SELECT contas_pagar retorna vazio
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(999));
    expect(res.status).toBe(404);
  });

  // ── Inter ativo: bloqueia ───────────────────────────────────────────────────

  it.each([
    "pendente_aprovacao",
    "processando",
    "aguardando_aprovacao",
  ])("retorna 409 quando inter_status='%s' (Inter em andamento)", async (interStatus) => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "pendente", inter_status: interStatus }]);
    const res = await PATCH(makePatchRequest({ valor: 100 }), makeParams(1));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/inter/i);
  });

  it("permite editar quando inter_status='pago' (já finalizado)", async () => {
    mockHappyPath({ conta: { situacao: "pago", inter_status: "pago" } });
    const res = await PATCH(makePatchRequest({ obs: "novo obs" }), makeParams(1));
    expect(res.status).toBe(200);
  });

  it("permite editar quando inter_status='rejeitado' (já finalizado)", async () => {
    mockHappyPath({ conta: { inter_status: "rejeitado" } });
    const res = await PATCH(makePatchRequest({ obs: "novo obs" }), makeParams(1));
    expect(res.status).toBe(200);
  });

  it("permite editar quando inter_status é null (sem Inter)", async () => {
    mockHappyPath({ conta: { inter_status: null } });
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(200);
  });

  // ── Auto-fill de data_pagamento ─────────────────────────────────────────────

  it("auto-preenche data_pagamento quando situacao='pago' e data_pagamento não enviada", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "pago" }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2]; // 3ª chamada = UPDATE
    const values = updateCall.slice(1) as unknown[];
    // Hoje no formato YYYY-MM-DD deve estar nos valores
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(values).toContain(todayIso);
  });

  it("respeita data_pagamento enviada quando situacao='pago'", async () => {
    mockHappyPath();
    await PATCH(
      makePatchRequest({ situacao: "pago", data_pagamento: "2026-04-01" }),
      makeParams(1),
    );
    const updateCall = sqlMock.mock.calls[2];
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("2026-04-01");
  });

  it("NÃO preenche data_pagamento quando situacao não é 'pago'", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "pendente" }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2];
    const values = updateCall.slice(1) as unknown[];
    // Sem auto-fill, data_pagamento vai como null
    const todayIso = new Date().toISOString().slice(0, 10);
    // Deve haver null mas NÃO o ISO de hoje (a menos que coincidência semântica)
    const nulls = values.filter((v) => v === null);
    expect(nulls.length).toBeGreaterThanOrEqual(1);
    // Pelo menos não tem o todayIso forçado (o teste passa se nem todayIso aparece)
    if (values.includes(todayIso)) {
      // Só falha se data_pagamento foi explicitamente preenchida com hoje sem ter sido pedida
      expect(false).toBe(true);
    }
  });

  // ── Conta deletada entre SELECT e UPDATE (race) ─────────────────────────────

  it("retorna 404 quando UPDATE RETURNING não retorna nenhuma linha (race)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "pendente", inter_status: null }])
      .mockResolvedValueOnce([]); // UPDATE RETURNING vazio
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(404);
  });

  // ── UPDATE: estrutura ──────────────────────────────────────────────────────

  it("UPDATE atinge a tabela contas_pagar", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ valor: 100 }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/UPDATE.*contas_pagar/i);
  });

  it("UPDATE usa COALESCE em todos os campos atualizáveis", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ valor: 100 }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/status\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/valor\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/data_vencimento\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/data_pagamento\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/observacao\s*=\s*COALESCE/i);
  });

  it("UPDATE força updated_at = now()", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "qualquer" }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/updated_at\s*=\s*now\(\)/i);
  });

  it("UPDATE inclui RETURNING id (pra detectar 404)", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/RETURNING\s+id/i);
  });

  it("repassa valores do body para o UPDATE", async () => {
    mockHappyPath();
    await PATCH(
      makePatchRequest({
        situacao: "pendente",
        valor: 1234.56,
        data_vencimento: "2026-05-10",
        data_pagamento: "2026-04-25",
        obs: "Quitado",
      }),
      makeParams(1),
    );
    const updateCall = sqlMock.mock.calls[2];
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("pendente");
    expect(values).toContain(1234.56);
    expect(values).toContain("2026-05-10");
    expect(values).toContain("2026-04-25");
    expect(values).toContain("Quitado");
  });

  it("ignora campos não whitelistados (id, created_at, fornecedor_id, descricao)", async () => {
    mockHappyPath();
    await PATCH(
      makePatchRequest({
        id: 999,
        created_at: "2020-01-01",
        fornecedor_id: 42,
        descricao: "tentativa de injeção",
        obs: "ok",
      } as Record<string, unknown>),
      makeParams(1),
    );
    const updateCall = sqlMock.mock.calls[2];
    const values = updateCall.slice(1) as unknown[];
    expect(values).not.toContain(999);
    expect(values).not.toContain("2020-01-01");
    expect(values).not.toContain(42);
    expect(values).not.toContain("tentativa de injeção");
    expect(values).toContain("ok");
  });

  it("body JSON inválido: trata como objeto vazio sem crashar", async () => {
    mockHappyPath();
    const res = await PATCH(makePatchRequest("isso-não-é-json"), makeParams(1));
    expect(res.status).toBe(200);
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────

  it("sucesso: retorna { ok: true } com status 200", async () => {
    mockHappyPath();
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams(1));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
