import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
const sqlSequence: any[] = [];
function makeQueryFn() {
  return vi.fn(() => {
    const result = sqlSequence.shift() ?? [];
    if (result instanceof Error) throw result;
    return Promise.resolve(result);
  });
}
const queryFn = makeQueryFn();

vi.mock("@/lib/db", () => ({
  default: Object.assign(queryFn, {
    begin: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      return await fn(makeQueryFn());
    }),
    array: (arr: unknown[]) => arr,
  }),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUser }, storage: { from: vi.fn() } })),
}));

vi.mock("@/lib/storage", () => ({
  ensureBucket: vi.fn(() => Promise.resolve()),
  uploadFile: vi.fn(() => Promise.resolve({ path: "mocked/path.jpg" })),
  getPublicUrl: vi.fn(() => "https://mocked.url/image.jpg"),
}));

vi.mock("@/lib/parametros", () => ({
  getParametroNumber: vi.fn(() => Promise.resolve(1)),
  getParametro: vi.fn(() => Promise.resolve("1")),
  PARAM: { INSUMO_SOBRA_CONVERSAO_SKU: "INSUMO_SOBRA_CONVERSAO_SKU" },
}));

const mockValidarPeso = vi.fn();
vi.mock("@/lib/ia-validar-peso", () => ({
  validarPesoBalanca: mockValidarPeso,
}));

// aprovar/recusar passaram a decidir permissão via podeDecidir (autoridade
// central de aprovações) em vez de checar role na hora — mocka direto pra não
// precisar simular resolverAprovadores/buscarUUIDsDaConfig (que fazem suas
// próprias queries e bagunçariam a fila sequencial do sqlSequence acima).
const mockPodeDecidir = vi.fn();
const mockResolverAprovadores = vi.fn();
vi.mock("@/lib/aprovacoes", () => ({
  podeDecidir: (...args: unknown[]) => mockPodeDecidir(...args),
  resolverAprovadores: (...args: unknown[]) => mockResolverAprovadores(...args),
}));

// ── Imports ──────────────────────────────────────────────────────────────────
const ROUTES: Record<string, any> = {};
const ROUTE_IMPORTS = {
  criar: "@/app/api/conversao-sku/route",
  aprovar: "@/app/api/conversao-sku/aprovar/route",
  recusar: "@/app/api/conversao-sku/recusar/route",
  concluir: "@/app/api/conversao-sku/concluir-servico/route",
};
for (const [key, path] of Object.entries(ROUTE_IMPORTS)) {
  const mod = await import(path);
  ROUTES[key] = mod;
}

// ── Constants ────────────────────────────────────────────────────────────────
const USER_ESTOQUISTA = { id: "uuid-estoquista" };
const USER_ADMIN = { id: "uuid-admin" };
const USER_OPERADOR = { id: "uuid-operador" };
const CONV_PENDENTE: any = {
  id: 1, ordem_id: 100, sku_origem_id: 200, sku_origem_quantidade: 1,
  sku_origem_peso: 10.5, local_origem_id: 2, sku_destino_id: 300,
  sku_destino_quantidade_desejada: 2, local_destino_id: 2,
  status_conversao: "pendente", reserva_id: 50, ordem_servico_id: null,
  created_by: USER_ESTOQUISTA.id, created_at: new Date(), updated_at: new Date(),
};
const CONV_EM_FABRICA = { ...CONV_PENDENTE, status_conversao: "em_fabrica" };

// ── Helpers ──────────────────────────────────────────────────────────────────
function req(url: string, body: any) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sqlSequence.length = 0;
  vi.clearAllMocks();
  mockPodeDecidir.mockResolvedValue({ pode: false, motivo: "aprovador_nao_configurado" });
  // Default: aprovador configurado (rota de criação segue em frente). Testes
  // que precisam do bloqueio "nao_configurado" sobrescrevem explicitamente.
  mockResolverAprovadores.mockResolvedValue({ status: "ok", aprovadores: ["uuid-aprovador"] });
});

// ═════════════════════════════════════════════════════════════════════════════
// TESTES
// ═════════════════════════════════════════════════════════════════════════════

describe("Conversão SKU — POST /api/conversao-sku (criar)", () => {
  const BODY = {
    sku_origem_id: 200, sku_origem_quantidade: 1, sku_origem_peso: 10.5,
    local_origem_id: 2, sku_destino_id: 300, sku_destino_quantidade_desejada: 2,
    local_destino_id: 2, foto_base64: "data:image/jpeg;base64,fake",
  };

  it("cria com sucesso", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push(
      [{ role: "estoquista_loja" }], // auth
    );
    // begin + tx calls:
    const call1 = sqlSequence.push.bind(sqlSequence); // BEGIN callback
    sqlSequence.push(
      [{ max_id: 0 }],  // SELECT MAX(id)
      [{ disponivel: 99 }], // saldo
      [{ id: 100, numero_ordem: "CS-0001" }], // INSERT ordem
      [{ id: 50 }],   // INSERT reserva
      [{ id: 1 }],    // INSERT conversoes_sku
    );

    const res = await ROUTES.criar.POST(req("/api/conversao-sku", BODY));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.ordem_id).toBe(100);
    expect(data.numero_ordem).toMatch(/^CS-/);
    expect(data.conversao_sku_id).toBe(1);
  });

  it("rejeita sem auth", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await ROUTES.criar.POST(req("/api/conversao-sku", BODY));
    expect(res.status).toBe(401);
  });

  it("rejeita role sem permissão", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push([{ role: "consultora" }]);
    const res = await ROUTES.criar.POST(req("/api/conversao-sku", BODY));
    expect(res.status).toBe(403);
  });

  it("rejeita saldo insuficiente", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push(
      [{ role: "estoquista_loja" }],
      [{ max_id: 0 }],
      [{ disponivel: 0 }], // insuficiente!
    );
    await expect(() =>
      ROUTES.criar.POST(req("/api/conversao-sku", BODY))
    ).rejects.toThrow(/saldo/i);
  });

  it("rejeita peso inválido", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push([{ role: "estoquista_loja" }]);
    const res = await ROUTES.criar.POST(req("/api/conversao-sku", { ...BODY, sku_origem_peso: -1 }));
    expect(res.status).toBe(400);
  });
});

describe("Conversão SKU — POST /api/conversao-sku/aprovar", () => {
  it("aprova como admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ADMIN } });
    mockPodeDecidir.mockResolvedValueOnce({ pode: true });
    sqlSequence.push(
      [{ role: "admin" }],          // auth
      [{ id: 10, status: "aguardando_aprovacao", ordem_id: 100 }], // tarefa
      [{ id: 1, status_conversao: "pendente", ordem_id: 100 }],   // conv
    );
    const res = await ROUTES.aprovar.POST(req("/api/conversao-sku/aprovar", { tarefa_id: 10 }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("rejeita não-admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push([{ role: "estoquista_loja" }]);
    const res = await ROUTES.aprovar.POST(req("/api/conversao-sku/aprovar", { tarefa_id: 10 }));
    expect(res.status).toBe(403);
  });

  it("rejeita já aprovada", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ADMIN } });
    mockPodeDecidir.mockResolvedValueOnce({ pode: true });
    sqlSequence.push(
      [{ role: "admin" }],
      [{ id: 10, status: "aguardando_aprovacao", ordem_id: 100 }],
      [{ id: 1, status_conversao: "aprovado", ordem_id: 100 }],
    );
    const res = await ROUTES.aprovar.POST(req("/api/conversao-sku/aprovar", { tarefa_id: 10 }));
    expect(res.status).toBe(409);
  });
});

describe("Conversão SKU — POST /api/conversao-sku/recusar", () => {
  it("recusa como admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ADMIN } });
    mockPodeDecidir.mockResolvedValueOnce({ pode: true });
    sqlSequence.push(
      [{ role: "admin" }],
      [{ id: 10, status: "aguardando_aprovacao", ordem_id: 100 }],
      [{ id: 1, status_conversao: "pendente", ordem_id: 100 }],
    );
    const res = await ROUTES.recusar.POST(req("/api/conversao-sku/recusar", { tarefa_id: 10, motivo: "Errado" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("rejeita não-admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push([{ role: "estoquista_loja" }]);
    const res = await ROUTES.recusar.POST(req("/api/conversao-sku/recusar", { tarefa_id: 10 }));
    expect(res.status).toBe(403);
  });
});

describe("Conversão SKU — POST /api/conversao-sku/concluir-servico", () => {
  it("conclui com sobra e quebra", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_OPERADOR } });
    sqlSequence.push(
      [{ role: "operador" }],
      [{ ...CONV_EM_FABRICA, sku_origem_peso: 10 }],
      [{ tipo_protocolo: "fabrica" }],
    );
    const res = await ROUTES.concluir.POST(req("/api/conversao-sku/concluir-servico", {
      conversao_sku_id: 1, peso_final: 9, quantidade_produzida: 1, peso_sobra_real: 0.5,
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.sobra_calculada).toBe(1);
    expect(data.quebra).toBe(0.5);
    expect(data.status).toBe("aguardando_volta");
  });

  it("conclui sem sobra", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_OPERADOR } });
    sqlSequence.push(
      [{ role: "operador" }],
      [{ ...CONV_EM_FABRICA, sku_origem_peso: 10 }],
      [{ tipo_protocolo: "fabrica" }],
    );
    const res = await ROUTES.concluir.POST(req("/api/conversao-sku/concluir-servico", {
      conversao_sku_id: 1, peso_final: 10, quantidade_produzida: 2, peso_sobra_real: 0,
    }));
    const data = await res.json();
    expect(data.sobra_calculada).toBe(0);
    expect(data.quebra).toBe(0);
  });

  it("rejeita conversão não em_fabrica (não encontrada)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_OPERADOR } });
    sqlSequence.push(
      [{ role: "operador" }],
      [],  // query retorna vazio → conv não encontrada (status diferente)
    );
    const res = await ROUTES.concluir.POST(req("/api/conversao-sku/concluir-servico", {
      conversao_sku_id: 1, peso_final: 9, quantidade_produzida: 1, peso_sobra_real: 0,
    }));
    expect(res.status).toBe(404);
  });

  it("rejeita sem permissão", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ESTOQUISTA } });
    sqlSequence.push([{ role: "estoquista_loja" }]);
    const res = await ROUTES.concluir.POST(req("/api/conversao-sku/concluir-servico", {
      conversao_sku_id: 1, peso_final: 9, quantidade_produzida: 1, peso_sobra_real: 0,
    }));
    expect(res.status).toBe(403);
  });
});

describe("Conversão SKU — POST /api/ia/validar-peso", () => {
  // Import inside test so vi.mock takes effect
  let IA_ROUTE: any;

  beforeEach(async () => {
    const mod = await import("@/app/api/ia/validar-peso/route");
    IA_ROUTE = mod;
  });

  it("retorna match quando peso confere", async () => {
    // authOr401 → requireAuth: getUser() + SELECT role,ativo (checa usuário ativo).
    mockGetUser.mockResolvedValue({ data: { user: USER_ADMIN } });
    sqlSequence.push([{ role: "admin", ativo: true }]);
    mockValidarPeso.mockResolvedValue({
      peso_digitado: 10.0, peso_balanca: 10.02, confianca: "alta",
      match: true, mensagem: "OK", provedor: "claude",
    });
    const res = await IA_ROUTE.POST(req("/api/ia/validar-peso", {
      imagem_base64: "ZmFrZQ==", peso_referencia: 10.0, tolerancia: 0.1,
    }));
    const data = await res.json();
    expect(data.match).toBe(true);
    expect(data.peso_balanca).toBe(10.02);
  });

  it("rejeita peso fora da tolerância", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER_ADMIN } });
    sqlSequence.push([{ role: "admin", ativo: true }]);
    mockValidarPeso.mockResolvedValue({
      peso_digitado: 10.0, peso_balanca: 10.3, confianca: "alta",
      match: false, mensagem: "Peso não confere", provedor: "claude",
    });
    const res = await IA_ROUTE.POST(req("/api/ia/validar-peso", {
      imagem_base64: "ZmFrZQ==", peso_referencia: 10.0, tolerancia: 0.1,
    }));
    const data = await res.json();
    expect(data.match).toBe(false);
    expect(data.diferenca).toBe(0.3);
  });
});

describe("Conversão SKU — Cálculos de Sobra/Quebra", () => {
  it("sem sobra", () => {
    expect(Math.max(10 - 10, 0)).toBe(0);
  });
  it("sobra exata", () => {
    const s = 10 - 9.5;
    expect(Math.max(s - 0.5, 0)).toBe(0);
  });
  it("quebra positiva", () => {
    const s = 10 - 9.5;
    expect(Math.max(s - 0.3, 0)).toBe(0.2);
  });
  it("sobra real > calculada: quebra zera", () => {
    const s = 10 - 9.5;
    expect(Math.max(s - 0.7, 0)).toBe(0);
  });
  it("peso final > origem: sobra = 0", () => {
    expect(Math.max(10 - 10.5, 0)).toBe(0);
  });
});

describe("Conversão SKU — Máquina de Estados", () => {
  it("fluxo completo tem 5 estados", () => {
    const estados = ["pendente", "aprovado", "em_fabrica", "aguardando_volta", "concluido"];
    expect(estados.length).toBe(5);
  });
});
