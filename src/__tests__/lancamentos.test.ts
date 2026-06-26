/**
 * Testes da rota GET /api/financeiro/lancamentos
 * Lista os últimos 200 lançamentos bancários (importados de OFX) com banco do extrato.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const { GET } = await import("@/app/api/financeiro/lancamentos/route");

const USER_ID = "user-uuid-1234";

describe("GET /api/financeiro/lancamentos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 sem usuário", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await GET();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it.each(["consultora", "motoboy", "ourives", "pcp", "estoquista_loja"])(
    "retorna 403 quando role é %s",
    async (role) => {
      sqlMock.mockResolvedValueOnce([{ role }]);
      const res = await GET();
      expect(res.status).toBe(403);
    },
  );

  it("retorna 403 quando usuário não existe", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it.each(["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"])(
    "aceita role %s",
    async (role) => {
      sqlMock
        .mockResolvedValueOnce([{ role }])
        .mockResolvedValueOnce([]);
      const res = await GET();
      expect(res.status).toBe(200);
    },
  );

  it("aceita roles de fullAccess (diretor)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "diretor" }])
      .mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("retorna lista vazia quando não há lançamentos", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("converte valor de string para Number", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([
        { id: 1, extrato_id: 10, fitid: "F1", tipo: "C", valor: "100.50", data_transacao: "2026-04-25", descricao: "Depósito", memo: null, conciliado: false, banco: "341" },
        { id: 2, extrato_id: 10, fitid: "F2", tipo: "D", valor: "50.25", data_transacao: "2026-04-24", descricao: "Saque", memo: null, conciliado: true, banco: "341" },
      ]);
    const res = await GET();
    const data = await res.json();
    expect(data[0].valor).toBe(100.5);
    expect(data[1].valor).toBe(50.25);
    expect(typeof data[0].valor).toBe("number");
  });

  it("query usa LEFT JOIN com fin_extratos_bancarios para trazer banco", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/LEFT JOIN.*fin_extratos_bancarios/i);
    expect(sqlText).toMatch(/e\.banco/);
  });

  it("query inclui campos esperados (id, fitid, tipo, valor, data_transacao, descricao, memo, conciliado)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/l\.id/);
    expect(sqlText).toMatch(/l\.fitid/);
    expect(sqlText).toMatch(/l\.tipo/);
    expect(sqlText).toMatch(/l\.valor/);
    expect(sqlText).toMatch(/l\.data_transacao/);
    expect(sqlText).toMatch(/l\.descricao/);
    expect(sqlText).toMatch(/l\.memo/);
    expect(sqlText).toMatch(/l\.conciliado/);
  });

  it("ordena por data_transacao DESC NULLS LAST, id DESC", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/ORDER BY l\.data_transacao DESC NULLS LAST, l\.id DESC/i);
  });

  it("limita a 200 registros", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/LIMIT 200/i);
  });
});
