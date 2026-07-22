/**
 * Testes da rota GET /api/tarefas?visao=time — GATE DE AUTORIZAÇÃO
 * (fecha buraco de segurança, 21/07 — ver comentário na própria rota e em
 * src/lib/roles.ts ROLES_TAREFAS_GERENCIAR / podeGerenciarTarefas).
 *
 * Antes desta correção, visao=time devolvia TODAS as tarefas de TODOS os
 * usuários pra qualquer autenticado — o front só ESCONDIA a aba
 * (TarefasClient.tsx podeGerenciar), a API não validava nada. Este teste
 * garante que o buraco não reabre: se alguém remover a checagem, ou o front
 * e a API voltarem a usar listas de roles diferentes, um destes casos quebra.
 *
 * Cobre:
 *  1. Sem sessão → 401
 *  2. Papel sem permissão de gerência (consultora) pedindo visao=time → 403
 *  3. Papel de gerência (gerente_loja) pedindo visao=time → passa do gate (200)
 *  4. Unidade: podeGerenciarTarefas() — mesma fonte usada pelo front
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { podeGerenciarTarefas } from "@/lib/roles";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Default: qualquer query SQL não controlada explicitamente devolve [] —
// suficiente pros vários fragmentos sql`` que a rota monta (reversaAprovadorCond,
// multiAprovadorCond, etc.) e pra query final (usada só como corpo da resposta).
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

vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { GET } = await import("@/app/api/tarefas/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(qs = "?visao=time") {
  return new NextRequest(`http://localhost/api/tarefas${qs}`, { method: "GET" });
}

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockImplementation(() => Promise.resolve([]));
  mockGetUser.mockReset();
});

describe("GET /api/tarefas?visao=time — autorização", () => {
  it("sem sessão → 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("consultora (sem podeGerenciar) pedindo visao=time → 403 (buraco fechado)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-consultora", email: "c@x.com" } } });
    // Q1: SELECT role FROM usuarios
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    // Deve barrar ANTES de montar a query grande — só 1 chamada ao SQL.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("gerente_loja (podeGerenciar) pedindo visao=time → passa do gate (200)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-gerente", email: "g@x.com" } } });
    // Q1: SELECT role FROM usuarios
    sqlMock.mockResolvedValueOnce([{ role: "gerente_loja" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("visao != time não é afetada (ex.: minhas) mesmo pra role sem podeGerenciar", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-consultora", email: "c@x.com" } } });
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);

    const res = await GET(makeRequest("?visao=minhas"));
    expect(res.status).toBe(200);
  });

  it("podeGerenciarTarefas() — mesma fonte usada pelo front (TarefasClient.tsx)", () => {
    expect(podeGerenciarTarefas("desenvolvedor")).toBe(true);
    expect(podeGerenciarTarefas("admin")).toBe(true);
    expect(podeGerenciarTarefas("gerente_fabrica")).toBe(true);
    expect(podeGerenciarTarefas("gerente_loja")).toBe(true);
    expect(podeGerenciarTarefas("consultora")).toBe(false);
    expect(podeGerenciarTarefas("motoboy")).toBe(false);
    expect(podeGerenciarTarefas(null)).toBe(false);
    expect(podeGerenciarTarefas(undefined)).toBe(false);
  });
});
