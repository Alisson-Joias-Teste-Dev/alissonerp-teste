/**
 * Testes da rota PATCH /api/financeiro/contas-receber/[id]
 *
 * A rota foi corrigida (v2.31.10) com:
 *   - Checagem de role financeiro
 *   - RETURNING id no UPDATE → retorna 404 quando conta não existe
 *   - Auto-fill de data_recebimento quando situacao='pago' ou 'recebido' e
 *     data_recebimento não foi enviada
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
const { PATCH } = await import("@/app/api/financeiro/contas-receber/[id]/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

function makePatchRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  } else {
    init.body = "{}";
  }
  return new NextRequest("http://localhost/api/financeiro/contas-receber/1", init);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Mock pipeline padrão para PATCH bem-sucedido:
 *   1. SELECT role from usuarios → role autorizada
 *   2. UPDATE ... RETURNING id → 1 linha afetada
 */
function mockHappyPath(opts?: {
  role?: string;
  contaId?: number;
  updateRows?: Array<{ id: number }>;
}) {
  sqlMock
    .mockResolvedValueOnce([{ role: opts?.role ?? "admin" }])
    .mockResolvedValueOnce(opts?.updateRows ?? [{ id: opts?.contaId ?? 1 }]);
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("PATCH /api/financeiro/contas-receber/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(makePatchRequest({}), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await PATCH(makePatchRequest({}), makeParams("1"));
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
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it("retorna 403 quando usuário não está cadastrado", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    expect(res.status).toBe(403);
  });

  it.each([
    "desenvolvedor",
    "admin",
    "gerente_fabrica",
    "gerente_loja",
  ])("aceita role %s", async (role) => {
    mockHappyPath({ role });
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
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
    const res = await PATCH(makePatchRequest({}), makeParams("0"));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando id é negativo", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await PATCH(makePatchRequest({}), makeParams("-5"));
    expect(res.status).toBe(400);
  });

  // ── Conta não encontrada ────────────────────────────────────────────────────
  it("retorna 404 quando UPDATE RETURNING não retorna nenhuma linha", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]); // UPDATE RETURNING vazio
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams("99999"));
    expect(res.status).toBe(404);
  });

  // ── Auto-fill de data_recebimento ───────────────────────────────────────────
  it("auto-preenche data_recebimento quando situacao='recebido' sem data", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "recebido" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(values).toContain(todayIso);
  });

  it("auto-preenche data_recebimento quando situacao='pago' sem data", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "pago" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    const todayIso = new Date().toISOString().slice(0, 10);
    expect(values).toContain(todayIso);
  });

  it("respeita data_recebimento enviada quando situacao='recebido'", async () => {
    mockHappyPath();
    await PATCH(
      makePatchRequest({ situacao: "recebido", data_recebimento: "2026-04-01" }),
      makeParams("1"),
    );
    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("2026-04-01");
  });

  it("NÃO preenche data_recebimento quando situacao não é pago/recebido", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "pendente" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    const todayIso = new Date().toISOString().slice(0, 10);
    if (values.includes(todayIso)) {
      // Auto-fill não esperado neste caso
      expect(false).toBe(true);
    }
    // Pelo menos um null (data_recebimento)
    expect(values.filter(v => v === null).length).toBeGreaterThanOrEqual(1);
  });

  // ── UPDATE: estrutura ──────────────────────────────────────────────────────
  it("UPDATE atinge contas_receber", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ situacao: "recebido" }), makeParams("42"));
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/UPDATE\s+alissonerp\.contas_receber/i);
  });

  it("UPDATE inclui RETURNING id", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/RETURNING\s+id/i);
  });

  it("UPDATE usa COALESCE em todos os campos atualizáveis", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/situacao\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/valor\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/data_vencimento\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/data_recebimento\s*=\s*COALESCE/i);
    expect(sqlText).toMatch(/obs\s*=\s*COALESCE/i);
  });

  it("UPDATE força updated_at = now()", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    const updateCall = sqlMock.mock.calls[1];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/updated_at\s*=\s*now\(\)/i);
  });

  it("ID é convertido para Number e usado no WHERE", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({}), makeParams("777"));
    const updateCall = sqlMock.mock.calls[1];
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain(777);
    expect(values).not.toContain("777");
  });

  // ── Body com cada campo ─────────────────────────────────────────────────────
  it("valor numérico é repassado", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ valor: 1234.56 }), makeParams("1"));
    const values = sqlMock.mock.calls[1].slice(1) as unknown[];
    expect(values).toContain(1234.56);
  });

  it("data_vencimento é repassada", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ data_vencimento: "2026-05-10" }), makeParams("1"));
    const values = sqlMock.mock.calls[1].slice(1) as unknown[];
    expect(values).toContain("2026-05-10");
  });

  it("obs é repassada", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({ obs: "Pagamento confirmado" }), makeParams("1"));
    const values = sqlMock.mock.calls[1].slice(1) as unknown[];
    expect(values).toContain("Pagamento confirmado");
  });

  // ── Whitelist ───────────────────────────────────────────────────────────────
  it("ignora campos não whitelistados (id, created_at, venda_erp_id, cliente_id)", async () => {
    mockHappyPath();
    await PATCH(
      makePatchRequest({
        id: 9999,
        created_at: "2020-01-01",
        venda_erp_id: 5,
        cliente_id: 7,
        cliente_nome: "Hacker",
        situacao: "recebido",
      }),
      makeParams("1"),
    );
    const values = sqlMock.mock.calls[1].slice(1) as unknown[];
    expect(values).toContain("recebido");
    expect(values).not.toContain(9999);
    expect(values).not.toContain("2020-01-01");
    expect(values).not.toContain(5);
    expect(values).not.toContain(7);
    expect(values).not.toContain("Hacker");
  });

  it("body JSON inválido: trata como objeto vazio sem crashar", async () => {
    mockHappyPath();
    const res = await PATCH(makePatchRequest("isso-não-é-json"), makeParams("1"));
    expect(res.status).toBe(200);
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────
  it("sucesso: retorna { ok: true } com status 200", async () => {
    mockHappyPath();
    const res = await PATCH(makePatchRequest({ obs: "x" }), makeParams("1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  // ── Tipos de cast ───────────────────────────────────────────────────────────
  it("data_vencimento e data_recebimento têm cast ::date no SQL", async () => {
    mockHappyPath();
    await PATCH(makePatchRequest({}), makeParams("1"));
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/data_vencimento\s*=\s*COALESCE\([^)]*::date/i);
    expect(sqlText).toMatch(/data_recebimento\s*=\s*COALESCE\([^)]*::date/i);
  });
});
