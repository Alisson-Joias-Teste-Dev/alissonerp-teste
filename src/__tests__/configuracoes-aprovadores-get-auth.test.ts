/**
 * Testes da rota GET /api/configuracoes/aprovadores — GATE DE AUTORIZAÇÃO
 * (fecha buraco de segurança, 21/07 — ver comentário na própria rota).
 *
 * Antes desta correção, o GET não tinha NENHUMA checagem — nem de sessão —
 * e vazava as chaves de aprovadores configurados + o roster completo de
 * usuários (nome, UUID, role) pra qualquer requisição. Este teste garante
 * que o buraco não reabre: se alguém remover o requireAuth/isFullAccess do
 * GET, um destes 3 casos quebra.
 *
 * Cobre:
 *  1. Sem sessão → 401
 *  2. Papel autenticado mas sem full-access (gerente_loja) → 403
 *  3. Papel full-access (admin) → passa do gate (200)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Default: qualquer query SQL não controlada explicitamente devolve [] — as
// várias listas de "usuários elegíveis" da rota fazem .map/.length sobre o
// retorno, então precisa ser sempre um array (nunca undefined).
const sqlMock = Object.assign(
  vi.fn((): Promise<any[]> => Promise.resolve([])), // eslint-disable-line @typescript-eslint/no-explicit-any -- mock generico, ver pattern em pagamento-ouro.test.ts
  { array: (arr: unknown[]) => arr },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { GET } = await import("@/app/api/configuracoes/aprovadores/route");

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockImplementation(() => Promise.resolve([]));
  mockGetUser.mockReset();
});

describe("GET /api/configuracoes/aprovadores — autorização", () => {
  it("sem sessão → 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("autenticado mas sem full-access (gerente_loja) → 403 (buraco fechado)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-gerente", email: "g@x.com" } } });
    // requireAuth: SELECT role, ativo FROM usuarios
    sqlMock.mockResolvedValueOnce([{ role: "gerente_loja", ativo: true }]);

    const res = await GET();
    expect(res.status).toBe(403);
    // Não deve nem tentar buscar as configs/roster de usuários.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("full-access (admin) → passa do gate (200)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-admin", email: "a@x.com" } } });
    sqlMock.mockResolvedValueOnce([{ role: "admin", ativo: true }]);

    const res = await GET();
    expect(res.status).toBe(200);
  });
});
