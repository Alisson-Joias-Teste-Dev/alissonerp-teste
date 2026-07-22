/**
 * Teste ANTI-VOLTA — BLOCO 5 (jul/2026), P1: `estoquista_loja` já podia CRIAR
 * frete avulso direto desde o BLOCO 3 (`podeCriarFreteAvulsoDireto`), mas não
 * tinha CAMINHO até a tela — `entregas-venda/page.tsx` (ROLES_PERMITIDOS) e
 * `api/entregas-venda/route.ts` (ROLES_ENTREGAS) devolviam 403/redirect pra
 * esse papel (achado registrado em docs/regras-negocio/entregas.md §8,
 * resolvido agora). Pedido do Jonathan: "o usuário do estoque tenha acesso
 * às entregas avulsas... que toda entrega chegue pra ele acompanhar".
 *
 * Este teste cobre o gate da API (GET /api/entregas-venda) — é o portão que
 * realmente controla os dados (o gate de `page.tsx` é a mesma condição,
 * script-a-script, sem lógica adicional pra testar isoladamente).
 *
 * P1 também exige que `estoquista_loja` NÃO caia no filtro de vendedor_id
 * (esse filtro é só pra `consultora` — sem isso, o estoque veria uma lista
 * vazia mesmo com o 403 resolvido).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string; vendedor_id: number | null } | null = null;
const sqlCalls: unknown[][] = [];
const sqlMock = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  if (texto.includes("COUNT(*)::integer AS total")) {
    return Promise.resolve([{ total: 0 }]);
  }
  return Promise.resolve([]);
});
vi.mock("@/lib/db", () => ({ default: (...args: unknown[]) => sqlMock(...args) }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const { GET } = await import("@/app/api/entregas-venda/route");

const USER_ID = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = null;
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

function usouFiltroVendedor(): boolean {
  return sqlCalls.some((args) => textoDaChamada(args).includes("AND ve.vendedor_id = "));
}

describe("GET /api/entregas-venda — estoquista_loja acompanha as entregas (BLOCO 5, P1)", () => {
  it("estoquista_loja passa no gate (200, não 403)", async () => {
    usuarioAtual = { role: "estoquista_loja", vendedor_id: null };
    const req = new NextRequest("http://localhost/api/entregas-venda");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("estoquista_loja vê TODAS as entregas — nenhum filtro por vendedor_id é aplicado", async () => {
    usuarioAtual = { role: "estoquista_loja", vendedor_id: 777 };
    const req = new NextRequest("http://localhost/api/entregas-venda");
    await GET(req);

    expect(usouFiltroVendedor()).toBe(false);
  });

  it("consultora CONTINUA restrita ao próprio vendedor_id (comportamento antigo intacto)", async () => {
    usuarioAtual = { role: "consultora", vendedor_id: 777 };
    const req = new NextRequest("http://localhost/api/entregas-venda");
    await GET(req);

    expect(usouFiltroVendedor()).toBe(true);
  });

  it("papel sem permissão nenhuma (ex.: motoboy) continua barrado — o gate não ficou permissivo demais", async () => {
    usuarioAtual = { role: "motoboy", vendedor_id: null };
    const req = new NextRequest("http://localhost/api/entregas-venda");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
