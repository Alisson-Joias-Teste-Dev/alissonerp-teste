/**
 * Testes da rota POST/GET /api/entregas-venda/fechamento-frete-cron (BLOCO 4).
 *
 * Cobre SÓ a rota (auth + resolução do ator do sistema + delegação pra
 * fecharMesFreteGratisAutomatico) — a lógica de fechamento em si já tem os
 * próprios testes em src/__tests__/frete-fechamento-mensal.test.ts. Mesmo
 * padrão de auth de src/app/api/crediario/aging-cron/route.ts: cron secret
 * (header x-cron-secret == process.env.FRETE_FECHAMENTO_CRON_SECRET) OU
 * usuário autenticado com role admin/desenvolvedor/gerente_loja.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const mockFecharMes = vi.fn();
vi.mock("@/lib/frete-fechamento", () => ({
  fecharMesFreteGratisAutomatico: (...args: unknown[]) => mockFecharMes(...args),
}));

const mockCriarNotificacao = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/notificacoes", () => ({
  criarNotificacao: (...args: unknown[]) => mockCriarNotificacao(...args),
}));

const { POST, GET } = await import("@/app/api/entregas-venda/fechamento-frete-cron/route");

const CRON_SECRET_ENV = "FRETE_FECHAMENTO_CRON_SECRET";
const SISTEMA_ADMIN_ID = "admin-sistema-uuid";
const USER_ID = "user-logado-uuid";

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/entregas-venda/fechamento-frete-cron", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[CRON_SECRET_ENV];
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  mockGetUser.mockResolvedValue({ data: { user: null } });
  mockFecharMes.mockResolvedValue({ jaFechado: false, tarefaId: null, aprovadoresNotificar: [] });
});

describe("POST fechamento-frete-cron — autenticação", () => {
  it("sem cron secret e sem usuário autenticado → 401", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFecharMes).not.toHaveBeenCalled();
  });

  it("cron secret errado (env configurado mas header não bate) → 401", async () => {
    process.env[CRON_SECRET_ENV] = "segredo-certo";
    const res = await POST(makeRequest({ "x-cron-secret": "segredo-errado" }));
    expect(res.status).toBe(401);
  });

  it("usuário autenticado mas SEM role elegível (ex.: consultora) → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("cron secret correto → autorizado, resolve o admin/desenvolvedor mais antigo como ator", async () => {
    process.env[CRON_SECRET_ENV] = "segredo-certo";
    sqlMock.mockResolvedValueOnce([{ id: SISTEMA_ADMIN_ID }]); // admin/desenvolvedor ativo mais antigo

    const res = await POST(makeRequest({ "x-cron-secret": "segredo-certo" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockFecharMes).toHaveBeenCalledWith(expect.any(Date), SISTEMA_ADMIN_ID);
  });

  it("cron secret correto mas NENHUM admin/desenvolvedor ativo cadastrado → 500 (nenhum ator para gravar created_by)", async () => {
    process.env[CRON_SECRET_ENV] = "segredo-certo";
    sqlMock.mockResolvedValueOnce([]); // nenhum admin/dev ativo

    const res = await POST(makeRequest({ "x-cron-secret": "segredo-certo" }));

    expect(res.status).toBe(500);
    expect(mockFecharMes).not.toHaveBeenCalled();
  });

  it("admin autenticado (sem cron secret) → autorizado usando o próprio id como ator", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockFecharMes).toHaveBeenCalledWith(expect.any(Date), USER_ID);
  });
});

describe("POST fechamento-frete-cron — notificação do pool (saldo negativo)", () => {
  it("tarefa criada com aprovadores → notifica cada um; jaFechado/sem tarefa → não notifica ninguém", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    mockFecharMes.mockResolvedValue({
      jaFechado: false,
      tarefaId: 900,
      saldoFinal: -40,
      mesReferencia: "2026-08-01",
      aprovadoresNotificar: ["aprov-1", "aprov-2"],
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockCriarNotificacao).toHaveBeenCalledTimes(2);
  });

  it("jaFechado:true (idempotência) → não notifica ninguém", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    mockFecharMes.mockResolvedValue({ jaFechado: true });

    const res = await POST(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.jaFechado).toBe(true);
    expect(mockCriarNotificacao).not.toHaveBeenCalled();
  });
});

describe("GET fechamento-frete-cron — preview (sem executar nada)", () => {
  it("sem usuário autenticado → 401", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("usuário sem role elegível → 403", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("admin autenticado → 200 com os últimos fechamentos, NUNCA chama fecharMesFreteGratisAutomatico", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ id: 1, status: "fechado" }]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ultimos_fechamentos).toEqual([{ id: 1, status: "fechado" }]);
    expect(mockFecharMes).not.toHaveBeenCalled();
  });
});
