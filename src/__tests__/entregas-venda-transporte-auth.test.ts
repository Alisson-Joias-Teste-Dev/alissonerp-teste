/**
 * Testes da rota PATCH /api/entregas-venda/[id]/transporte — GATE DE AUTORIZAÇÃO
 * (fecha buraco de segurança, 21/07 — ver comentário na própria rota).
 *
 * Antes desta correção, a rota só verificava que o usuário EXISTIA em
 * alissonerp.usuarios — qualquer autenticado (motoboy incluso) alterava
 * frete_motoboy e motoboy_id de QUALQUER entrega. Este teste garante que o
 * buraco NÃO reabre silenciosamente: se alguém remover/trocar o
 * requireEntregaVendaAccess por engano, um destes 3 casos quebra.
 *
 * Cobre:
 *  1. Sem sessão → 401
 *  2. Papel sem permissão sobre a entrega (motoboy, sem ser o designado) → 403
 *  3. Papel autorizado (gerente_loja, role full-access) → passa do gate
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockAtualizarTransporte = vi.fn();
vi.mock("@/lib/entrega-venda", () => ({
  atualizarTransporte: (...args: unknown[]) => mockAtualizarTransporte(...args),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { PATCH } = await import("@/app/api/entregas-venda/[id]/transporte/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTREGA_ID = 123;

function makeRequest(body: Record<string, unknown> = { freteMotoboy: 15 }) {
  return new NextRequest(`http://localhost/api/entregas-venda/${ENTREGA_ID}/transporte`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: String(ENTREGA_ID) }) };
}

beforeEach(() => {
  sqlMock.mockReset();
  mockGetUser.mockReset();
  mockAtualizarTransporte.mockReset();
});

describe("PATCH /api/entregas-venda/[id]/transporte — autorização", () => {
  it("sem sessão → 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await PATCH(makeRequest(), makeParams());
    expect(res.status).toBe(401);
    // Não deve nem tentar consultar a entrega.
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("motoboy sem vínculo com a entrega → 403 (buraco fechado)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-motoboy", email: "m@x.com" } } });
    // Q1 (requireAuth): SELECT role, ativo
    sqlMock.mockResolvedValueOnce([{ role: "motoboy", ativo: true }]);
    // Q2 (requireEntregaVendaAccess): SELECT venda_id, motoboy_id FROM entregas_venda
    sqlMock.mockResolvedValueOnce([{ venda_id: 1, motoboy_id: "outro-motoboy-uuid" }]);

    const res = await PATCH(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    // A lib de negócio NUNCA deve ser chamada quando o gate barra.
    expect(mockAtualizarTransporte).not.toHaveBeenCalled();
  });

  it("gerente_loja (role full-access de vendas) → passa do gate", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-gerente", email: "g@x.com" } } });
    // Q1 (requireAuth): SELECT role, ativo
    sqlMock.mockResolvedValueOnce([{ role: "gerente_loja", ativo: true }]);
    // Q2 (requireEntregaVendaAccess): SELECT venda_id, motoboy_id FROM entregas_venda
    sqlMock.mockResolvedValueOnce([{ venda_id: 1, motoboy_id: null }]);
    mockAtualizarTransporte.mockResolvedValueOnce({ id: ENTREGA_ID, frete_motoboy: 15 });

    const res = await PATCH(makeRequest({ freteMotoboy: 15 }), makeParams());
    expect(res.status).toBe(200);
    expect(mockAtualizarTransporte).toHaveBeenCalledWith(
      ENTREGA_ID,
      expect.objectContaining({ freteMotoboy: 15 }),
      "user-gerente",
    );
  });
});
