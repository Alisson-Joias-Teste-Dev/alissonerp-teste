/**
 * Testes da rota GET /api/financeiro/extratos
 * Lista os últimos 50 extratos bancários (uploads OFX).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = Object.assign(vi.fn(), { array: (a: unknown[]) => a });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const { GET } = await import("@/app/api/financeiro/extratos/route");

const USER_ID = "user-uuid-1234";

describe("GET /api/financeiro/extratos", () => {
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

  it("retorna lista vazia quando não há extratos", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("retorna extratos com todos os campos esperados", async () => {
    const mockExtratos = [
      {
        id: 1, banco: "341", agencia: "0001", conta: "12345-6",
        data_inicio: "2026-04-01", data_fim: "2026-04-30",
        arquivo_url: null, arquivo_nome: "extrato.ofx",
        processado: true, total_lancamentos: 25,
        created_at: "2026-04-25T10:00:00Z",
      },
    ];
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce(mockExtratos);
    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
    expect(data[0].banco).toBe("341");
    expect(data[0].arquivo_nome).toBe("extrato.ofx");
    expect(data[0].total_lancamentos).toBe(25);
  });

  it("query inclui campos esperados", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/id/);
    expect(sqlText).toMatch(/banco/);
    expect(sqlText).toMatch(/agencia/);
    expect(sqlText).toMatch(/conta/);
    expect(sqlText).toMatch(/data_inicio/);
    expect(sqlText).toMatch(/data_fim/);
    expect(sqlText).toMatch(/arquivo_nome/);
    expect(sqlText).toMatch(/processado/);
    expect(sqlText).toMatch(/total_lancamentos/);
    expect(sqlText).toMatch(/created_at/);
  });

  it("query atinge tabela fin_extratos_bancarios", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/FROM\s+alissonerp\.fin_extratos_bancarios/i);
  });

  it("ordena por created_at DESC", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/ORDER BY created_at DESC/i);
  });

  it("limita a 50 registros", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]);
    await GET();
    const sqlText = (sqlMock.mock.calls[1][0] as string[]).join(" ");
    expect(sqlText).toMatch(/LIMIT 50/i);
  });
});
