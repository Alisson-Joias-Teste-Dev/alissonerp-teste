/**
 * Testes ANTI-VOLTA — `GET /api/entregas-venda/fechamentos` (BLOCO 5, 21/07 —
 * aba "Fechamentos de frete", mockup aprovado pelo Jonathan; ver
 * docs/regras-negocio/entregas.md §10.6).
 *
 * Cobre: gate de papel (MESMO conjunto de `motoboy/pagar`/`motoboy/relatorio-
 * pagamento` — `ROLES_PAGAMENTO_MOTOBOY`, não alargado pra
 * consultora/estoquista_loja), paginação (page/limit/totalPages), lista
 * vazia não quebra, e que a rota é 100% READ-ONLY (só exporta GET).
 *
 * Mesmo padrão de mock de `motoboy-relatorio-pagamento-route.test.ts`:
 * responde por CONTEÚDO da query (texto), não por posição.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string } | null = null;
let listaRowsMock: Record<string, unknown>[] = [];
let totalMock = 0;
const sqlCalls: unknown[][] = [];

const sqlFn = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  if (texto.includes("FROM alissonerp.fechamentos_frete f")) {
    return Promise.resolve(listaRowsMock);
  }
  if (texto.includes("SELECT COUNT(*)::integer AS total FROM alissonerp.fechamentos_frete")) {
    return Promise.resolve([{ total: totalMock }]);
  }
  return Promise.resolve([]);
});
vi.mock("@/lib/db", () => ({ default: sqlFn }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const routeModule = await import("@/app/api/entregas-venda/fechamentos/route");
const { GET } = routeModule;

const USER_ID = "44444444-4444-4444-4444-444444444444";
const GERENTE_ID = "99999999-9999-9999-9999-999999999999";

function getReq(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/entregas-venda/fechamentos${qs ? `?${qs}` : ""}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = { role: "admin" };
  listaRowsMock = [];
  totalMock = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

describe("GET /api/entregas-venda/fechamentos — rota é 100% read-only", () => {
  it("só exporta GET (nenhum POST/PUT/PATCH/DELETE)", () => {
    const modulo = routeModule as unknown as Record<string, unknown>;
    expect(modulo.POST).toBeUndefined();
    expect(modulo.PUT).toBeUndefined();
    expect(modulo.PATCH).toBeUndefined();
    expect(modulo.DELETE).toBeUndefined();
  });
});

describe("GET /api/entregas-venda/fechamentos — gate de papel", () => {
  it("admin/gerente_loja/desenvolvedor passam (mesma lista de motoboy/pagar)", async () => {
    for (const role of ["admin", "gerente_loja", "desenvolvedor"]) {
      usuarioAtual = { role };
      const res = await GET(getReq());
      expect(res.status).toBe(200);
    }
  });

  it("consultora é barrada com 403 (NÃO alarga o gate de 'Pagamento do motoboy')", async () => {
    usuarioAtual = { role: "consultora" };
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("estoquista_loja é barrado com 403 (vê a TELA de entregas, não este relatório financeiro)", async () => {
    usuarioAtual = { role: "estoquista_loja" };
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("sem usuário autenticado -> 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });
});

describe("GET /api/entregas-venda/fechamentos — lista paginada", () => {
  it("lista vazia -> 200 com items=[] e total=0 (não quebra, critério de aceite)", async () => {
    listaRowsMock = [];
    totalMock = 0;
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it("devolve items formatados — saldo negativo com tarefa traz o vínculo, status coerente", async () => {
    listaRowsMock = [
      {
        id: 42, gerente_id: GERENTE_ID, gerente_nome: "Maria Gerente",
        mes_referencia: "2026-07-01", saldo_anterior: "0.00", total_creditos: "50.00",
        total_debitos: "90.00", saldo_final: "-40.00", verba_creditada: "100.00",
        faturamento_base: "100000.00", percentual_verba: "0.1",
        status: "aguardando_aprovacao", tarefa_aprovacao_id: 900, conta_pagar_id: null,
        created_at: "2026-08-01T10:00:00Z",
      },
    ];
    totalMock = 1;
    const res = await GET(getReq({ page: "1" }));
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe("aguardando_aprovacao");
    expect(body.items[0].tarefaAprovacaoId).toBe(900);
    expect(body.items[0].contaPagarId).toBeNull();
    expect(body.items[0].saldoFinal).toBe(-40);
    expect(body.limit).toBe(10);
  });

  it("página inválida/ausente cai em 1 (nunca quebra)", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.page).toBe(1);
  });

  it("totalPages calculado a partir do total (paginação de 10)", async () => {
    totalMock = 23;
    const res = await GET(getReq({ page: "2" }));
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.totalPages).toBe(3); // ceil(23/10)
  });
});
