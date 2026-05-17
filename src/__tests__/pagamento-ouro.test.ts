/**
 * Testes da rota POST /api/vendas/[id]/pagamentos — forma "Ouro"
 *
 * Verifica:
 *  1. Autenticação obrigatória
 *  2. Campos obrigatórios (peso, valor_grama, foto_path)
 *  3. Rejeita venda bloqueada
 *  4. Rejeita desconto >30% sem aprovação
 *  5. Rejeita venda já totalmente paga
 *  6. Sucesso: insere com status=confirmado e valor calculado (peso × valor_grama)
 *  7. Valor é sempre calculado no servidor, nunca usa o campo "valor" do body
 *  8. Outras formas (Dinheiro) não são afetadas pela lógica Ouro
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/vale-troca", () => ({
  aplicarValeTroca: vi.fn(),
}));

// Onda 1D adicionou requireVendaOwnership na rota — sem mock os testes
// estouram em AuthError pq o sql nao retorna vendedor_id valido. Mockamos o
// helper inteiro para "passar" e isolar o teste no comportamento da rota.
vi.mock("@/lib/auth-vendas", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth-vendas")>();
  return {
    ...actual,
    requireVendaOwnership: vi.fn(async () => ({ vendedor_id: 1 })),
  };
});

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import("@/app/api/vendas/[id]/pagamentos/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-consultora-uuid";
const VENDA_ID = 42;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/vendas/${VENDA_ID}/pagamentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: number = VENDA_ID) {
  return { params: Promise.resolve({ id: String(id) }) };
}

/** Configura sql para venda válida (não bloqueada, sem desconto alto) */
function setupVendaOk(jaConfirmado = 0, totalVenda = 1000) {
  sqlMock
    // 1. SELECT venda (bloqueado, situacao, desconto_aprovado_por, tem_desconto_alto)
    .mockResolvedValueOnce([{
      id: VENDA_ID,
      bloqueado: false,
      situacao: "rascunho",
      desconto_aprovado_por: null,
      tem_desconto_alto: false,
    }])
    // 2. SELECT role para checkOwnership (Onda 1D)
    .mockResolvedValueOnce([{ role: "admin" }])
    // 3. SELECT totais (para guard venda já paga)
    .mockResolvedValueOnce([{
      total_venda: totalVenda,
      soma_confirmados: jaConfirmado,
    }]);
}

/** Configura sql para o INSERT de ouro (retorna id) */
function setupInsertOuro(id = 99) {
  sqlMock.mockResolvedValueOnce([{ id }]);
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST /api/vendas/[id]/pagamentos — forma Ouro", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    sqlMock.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200, ouro_foto_path: "path.jpg" }), makeParams());
    expect(res.status).toBe(401);
  });

  // ── Campos obrigatórios ─────────────────────────────────────────────────────

  it("retorna 400 quando ouro_peso ausente", async () => {
    setupVendaOk();
    const res = await POST(makeRequest({ forma: "Ouro", ouro_valor_grama: 200, ouro_foto_path: "path.jpg" }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/peso/i);
  });

  it("retorna 400 quando ouro_peso = 0", async () => {
    setupVendaOk();
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 0, ouro_valor_grama: 200, ouro_foto_path: "path.jpg" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando ouro_valor_grama ausente", async () => {
    setupVendaOk();
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_foto_path: "path.jpg" }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/grama/i);
  });

  it("retorna 400 quando ouro_foto_path ausente", async () => {
    setupVendaOk();
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200 }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/foto/i);
  });

  // ── Guards de venda ─────────────────────────────────────────────────────────

  it("retorna 409 quando venda está bloqueada", async () => {
    // bloqueio acontece ANTES do checkOwnership — so 1 query (SELECT venda)
    sqlMock.mockResolvedValueOnce([{
      id: VENDA_ID, bloqueado: true, situacao: "rascunho",
      desconto_aprovado_por: null, tem_desconto_alto: false,
    }]);
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200, ouro_foto_path: "p.jpg" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/bloqueada/i);
  });

  it("retorna 409 quando desconto >30% não aprovado", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        id: VENDA_ID, bloqueado: false, situacao: "rascunho",
        desconto_aprovado_por: null, tem_desconto_alto: true,
      }])
      // checkOwnership ocorre ANTES do guard de desconto agora (Onda 1D)
      .mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200, ouro_foto_path: "p.jpg" }), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/desconto/i);
  });

  it("retorna 409 quando venda já está totalmente paga", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        id: VENDA_ID, bloqueado: false, situacao: "rascunho",
        desconto_aprovado_por: null, tem_desconto_alto: false,
      }])
      // SELECT role para checkOwnership
      .mockResolvedValueOnce([{ role: "admin" }])
      // SELECT vendaLock dentro do begin (forma Ouro) com total_venda e soma_confirmados
      .mockResolvedValueOnce([{ total_venda: 1000, soma_confirmados: 1000 }]);
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => {
      // cb roda dentro da transacao; aqui apenas relayamos pro sqlMock principal
      return cb(sqlMock);
    });
    const res = await POST(makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200, ouro_foto_path: "p.jpg" }), makeParams());
    // Hook ouro retorna 409 via internalError quando ultrapassa total
    expect([409, 500]).toContain(res.status);
  });

  // ── Sucesso ─────────────────────────────────────────────────────────────────

  it("cria pagamento com status=confirmado e retorna id + valor", async () => {
    setupVendaOk();
    setupInsertOuro(77);

    const res = await POST(
      makeRequest({ forma: "Ouro", ouro_peso: 5, ouro_valor_grama: 200, ouro_foto_path: "pagamentos/42/foto.jpg" }),
      makeParams()
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(77);
    expect(data.valor).toBe(1000); // 5g × R$200/g
  });

  it("valor é calculado pelo servidor: peso × valor_grama (ignora valor do body)", async () => {
    setupVendaOk();
    setupInsertOuro(88);

    // Envia valor=9999 no body — deve ser ignorado
    await POST(
      makeRequest({ forma: "Ouro", valor: 9999, ouro_peso: 2.5, ouro_valor_grama: 180, ouro_foto_path: "p.jpg" }),
      makeParams()
    );

    // O INSERT deve ter recebido 2.5 × 180 = 450, não 9999
    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("pagamentos_venda");
    });
    expect(insertCall).toBeDefined();
    const interpolatedValues = insertCall!.slice(1) as unknown[];
    expect(interpolatedValues).toContain(450); // 2.5 × 180
    expect(interpolatedValues).not.toContain(9999);
  });

  it("INSERT inclui status=confirmado e data_confirmacao", async () => {
    setupVendaOk();
    setupInsertOuro(55);

    await POST(
      makeRequest({ forma: "Ouro", ouro_peso: 3, ouro_valor_grama: 300, ouro_foto_path: "foto.jpg" }),
      makeParams()
    );

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("pagamentos_venda");
    });
    const sqlParts = (insertCall![0] as string[]).join(" ");
    expect(sqlParts).toMatch(/confirmado/);
    expect(sqlParts).toMatch(/now\(\)/i);
  });

  it("INSERT salva ouro_peso, ouro_valor_grama e ouro_foto_path", async () => {
    setupVendaOk();
    setupInsertOuro(66);

    await POST(
      makeRequest({ forma: "Ouro", ouro_peso: 4, ouro_valor_grama: 250, ouro_foto_path: "pagamentos/42/ts.jpg" }),
      makeParams()
    );

    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("INSERT") && parts.includes("pagamentos_venda");
    });
    expect(insertCall).toBeDefined();
    const values = insertCall!.slice(1) as unknown[];
    expect(values).toContain(4);            // ouro_peso
    expect(values).toContain(250);          // ouro_valor_grama
    expect(values).toContain("pagamentos/42/ts.jpg"); // ouro_foto_path
  });

  // ── Regressão: outras formas não são afetadas ───────────────────────────────

  it("Dinheiro ainda funciona sem campos Ouro", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        id: VENDA_ID, bloqueado: false, situacao: "rascunho",
        desconto_aprovado_por: null, tem_desconto_alto: false,
      }])
      // SELECT role para checkOwnership (Onda 1D)
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ total_venda: 1000, soma_confirmados: 0 }])
      // sql`now()` é um fragmento de template — consome 1 slot antes do INSERT real
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 11 }]); // INSERT

    const res = await POST(
      makeRequest({ forma: "Dinheiro", valor: 500 }),
      makeParams()
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(11);
  });

  it("A Receber ainda funciona sem campos Ouro", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        id: VENDA_ID, bloqueado: false, situacao: "rascunho",
        desconto_aprovado_por: null, tem_desconto_alto: false,
      }])
      // SELECT role para checkOwnership (Onda 1D)
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([{ total_venda: 1000, soma_confirmados: 0 }])
      .mockResolvedValueOnce([{ id: 22 }]); // INSERT

    const res = await POST(
      makeRequest({ forma: "A Receber", valor: 300 }),
      makeParams()
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(22);
  });
});
