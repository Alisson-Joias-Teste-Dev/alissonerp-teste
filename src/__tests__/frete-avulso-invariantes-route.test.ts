/**
 * Testes ANTI-VOLTA do POST /api/entregas-venda/frete-avulso (BLOCO 3, 21/07).
 *
 * O QUE COBRE:
 *
 *  P1 — ownership vira INVARIANTE (não presa ao modo `solicitar`): antes só
 *    rodava dentro de `if (ehSolicitacao)` — a criação DIRETA gravava
 *    venda_id sem checar dono nenhum. Prova aqui: modo DIRETO
 *    (solicitar=false/omitido) com vendaId de venda de OUTRA pessoa é
 *    barrado (403), e criarFreteAvulso NUNCA roda (a corrida não nasce
 *    pendurada na venda alheia).
 *
 *  P3/P4/P5 — enforcement por MODO usando a fonte única
 *    (src/lib/permissoes/frete-avulso.ts): diretor pode solicitar mas NÃO
 *    cria direto; estoquista_loja (papel REAL confirmado no banco — ver
 *    relato) cria direto normalmente.
 *
 * Estratégia: mocks de @/lib/db (só a query de role), @/lib/supabase/server
 * (getUser) e @/lib/entrega-venda (criarFreteAvulso — espiado, nunca deve
 * rodar quando a rota barra antes). requireVendaOwnership é mockado
 * seletivamente por teste (importOriginal preserva NotFoundError real); a
 * regra de negócio DELA (ownership por vendedor_id) tem teste próprio em
 * auth-vendas — aqui o que se prova é que a ROTA a chama sempre que há
 * vendaId, independente do modo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/auth-server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

let roleDoUsuario: string | null = null;
const sqlMock = vi.fn((..._args: unknown[]) => Promise.resolve(roleDoUsuario ? [{ role: roleDoUsuario }] : []));
vi.mock("@/lib/db", () => ({ default: (...args: unknown[]) => sqlMock(...args) }));

const mockRequireVendaOwnership = vi.fn();
vi.mock("@/lib/auth-vendas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-vendas")>()),
  requireVendaOwnership: (...args: unknown[]) => mockRequireVendaOwnership(...args),
}));

const mockCriarFreteAvulso = vi.fn();
vi.mock("@/lib/entrega-venda", () => ({
  criarFreteAvulso: (...args: unknown[]) => mockCriarFreteAvulso(...args),
  calcularValorMotoboy: () => 10,
}));

const { POST } = await import("@/app/api/entregas-venda/frete-avulso/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-1111-1111-111111111111";
const VENDA_DE_OUTRA_CONSULTORA = 9999;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/entregas-venda/frete-avulso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bodyBase(extra: Record<string, unknown> = {}) {
  return {
    regiao: "fortaleza",
    freteCobrado: 15,
    descricaoAvulso: "Levar peça pra loja",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  roleDoUsuario = null;
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
  mockCriarFreteAvulso.mockResolvedValue({ id: 1, situacao: "pendente" });
});

describe("P1 — ownership vale SEMPRE que há vendaId, independente do modo", () => {
  it("modo DIRETO (solicitar omitido) com vendaId de venda ALHEIA → 403, criarFreteAvulso NUNCA roda", async () => {
    roleDoUsuario = "consultora";
    mockRequireVendaOwnership.mockRejectedValue(new ForbiddenError("Sem permissao para esta venda"));

    const res = await POST(makeRequest(bodyBase({ vendaId: VENDA_DE_OUTRA_CONSULTORA })));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/sem permiss/i);
    expect(mockRequireVendaOwnership).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID, role: "consultora" }),
      VENDA_DE_OUTRA_CONSULTORA,
    );
    expect(mockCriarFreteAvulso).not.toHaveBeenCalled();
  });

  it("modo DIRETO (solicitar: false explícito) com vendaId de venda ALHEIA → 403, criarFreteAvulso NUNCA roda", async () => {
    roleDoUsuario = "gerente_loja";
    mockRequireVendaOwnership.mockRejectedValue(new ForbiddenError("Sem permissao para esta venda"));

    const res = await POST(makeRequest(bodyBase({ vendaId: VENDA_DE_OUTRA_CONSULTORA, solicitar: false })));

    expect(res.status).toBe(403);
    expect(mockCriarFreteAvulso).not.toHaveBeenCalled();
  });

  it("modo DIRETO com vendaId da PRÓPRIA venda (ownership OK) → segue e chama criarFreteAvulso", async () => {
    roleDoUsuario = "consultora";
    mockRequireVendaOwnership.mockResolvedValue({ vendedor_id: 42 });

    const res = await POST(makeRequest(bodyBase({ vendaId: 123 })));

    expect(res.status).toBe(200);
    expect(mockCriarFreteAvulso).toHaveBeenCalledTimes(1);
    expect(mockCriarFreteAvulso.mock.calls[0][0]).toMatchObject({ vendaId: 123, modoSolicitacao: false });
  });

  it("SEM vendaId (modo direto) → requireVendaOwnership NUNCA é chamado (nada pra checar)", async () => {
    roleDoUsuario = "estoquista_loja";

    const res = await POST(makeRequest(bodyBase()));

    expect(res.status).toBe(200);
    expect(mockRequireVendaOwnership).not.toHaveBeenCalled();
    expect(mockCriarFreteAvulso).toHaveBeenCalledTimes(1);
  });
});

describe("P3/P4 — enforcement por MODO via fonte única (src/lib/permissoes/frete-avulso.ts)", () => {
  it("diretor SOLICITANDO (solicitar: true) → autorizado", async () => {
    roleDoUsuario = "diretor";

    const res = await POST(makeRequest(bodyBase({
      solicitar: true,
      pagante: "loja",
      enderecoEntregaLogradouro: "Rua X",
      enderecoEntregaNumero: "10",
      enderecoEntregaCidade: "Fortaleza",
    })));

    expect(res.status).toBe(200);
    expect(mockCriarFreteAvulso).toHaveBeenCalledTimes(1);
  });

  it("diretor tentando CRIAR DIRETO (solicitar omitido) → 403 (diretor só solicita, decisão Jonathan)", async () => {
    roleDoUsuario = "diretor";

    const res = await POST(makeRequest(bodyBase()));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/frete avulso direto/i);
    expect(mockCriarFreteAvulso).not.toHaveBeenCalled();
  });

  it("estoquista_loja (papel REAL confirmado no banco) CRIANDO DIRETO → autorizado", async () => {
    roleDoUsuario = "estoquista_loja";

    const res = await POST(makeRequest(bodyBase()));

    expect(res.status).toBe(200);
    expect(mockCriarFreteAvulso).toHaveBeenCalledTimes(1);
  });

  it("papel sem NENHUM acesso ao módulo (ex.: ourives) → 403 já no gate de entrada", async () => {
    roleDoUsuario = "ourives";

    const res = await POST(makeRequest(bodyBase()));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toMatch(/sem permiss/i);
    expect(mockCriarFreteAvulso).not.toHaveBeenCalled();
  });
});
