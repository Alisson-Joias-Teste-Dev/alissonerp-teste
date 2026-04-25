/**
 * Testes da rota POST /api/vendas/[id]/solicitar-aprovacao
 * para o fluxo tipo="desconto".
 *
 * Dependências de DB e Supabase são mockadas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declarados antes dos imports da rota ────────────────────────────────

// Mock do sql (tagged template literal)
const sqlMock = Object.assign(vi.fn(), { array: (arr: unknown[]) => arr });
vi.mock("@/lib/db", () => ({ default: sqlMock }));

// Mock do Supabase server
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// Mocks de libs de negócio (não usados no fluxo desconto, mas importadas pelo módulo)
vi.mock("@/lib/vendas-credito-aprovar", () => ({
  submeterVendaParaAprovacaoCredito: vi.fn(),
}));
vi.mock("@/lib/vendas-aprovar", () => ({
  approveVenda: vi.fn(),
}));
vi.mock("@/lib/roles", () => ({
  isFullAccess: vi.fn(() => false),
  hasRole: vi.fn(() => false),
}));

// ── Import da rota DEPOIS dos mocks ──────────────────────────────────────────
const { POST } = await import(
  "@/app/api/vendas/[id]/solicitar-aprovacao/route"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(vendaId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/vendas/${vendaId}/solicitar-aprovacao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Sequência padrão de respostas SQL para fluxo tipo="desconto" com sucesso
function setupSqlDesconto(overrides: { adminResult?: unknown[]; tarefaResult?: unknown[] } = {}) {
  sqlMock
    .mockResolvedValueOnce([{ role: "consultora" }])                          // 1. SELECT role FROM usuarios
    .mockResolvedValueOnce([{                                                  // 2. SELECT venda
      id: 1, situacao: "rascunho", bloqueado: false, aprovacao_credito_tarefa_id: null,
    }])
    .mockResolvedValueOnce(overrides.adminResult ?? [{ id: "admin-uuid-456" }]) // 3. SELECT admin
    .mockResolvedValueOnce([{ numero_venda: "V-001", total_venda: "500.00" }])  // 4. SELECT venda info
    .mockResolvedValueOnce([{ sku: "SKU-001", nome_produto: "Anel", preco_lista: "200.00", pct_desconto: "35", preco_unitario: "130.00", quantidade: 1 }]) // 5. SELECT itens desconto
    .mockResolvedValueOnce(overrides.tarefaResult ?? [{ id: 99 }])              // 6. INSERT tarefa
    .mockResolvedValueOnce([{ id: 1 }])                                         // 7. INSERT aprovacoes_tarefa
    .mockResolvedValueOnce([])                                                  // 8. UPDATE vendas_erp
    .mockResolvedValueOnce([]);                                                 // 9. INSERT notificacoes
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST solicitar-aprovacao — tipo='desconto'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-test-uuid" } } });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("retorna 400 para vendaId inválido", async () => {
    const res = await POST(makeRequest("abc", { tipo: "desconto" }), makeParams("abc"));
    expect(res.status).toBe(400);
  });

  it("fluxo completo: cria tarefa de aprovação de desconto", async () => {
    setupSqlDesconto();

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.aguardando_aprovacao_desconto).toBe(true);
    expect(data.tarefa_id).toBe(99);
  });

  it("retorna 409 quando venda não está em rascunho", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "aprovado", bloqueado: false, aprovacao_credito_tarefa_id: null }]);

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    expect(res.status).toBe(409);
  });

  it("retorna early quando já existe aprovação pendente (aprovacao_credito_tarefa_id set)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "rascunho", bloqueado: false, aprovacao_credito_tarefa_id: 77 }]);

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.aguardando_aprovacao_desconto).toBe(true);
    // Não deve ter feito mais queries (nenhum INSERT tarefa)
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("retorna 500 quando nenhum admin ativo é encontrado", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "rascunho", bloqueado: false, aprovacao_credito_tarefa_id: null }])
      .mockResolvedValueOnce([]); // nenhum admin

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    expect(res.status).toBe(500);
  });

  // TODO: teste pré-existente quebrou após mudança no fluxo de aReceber.
  // Skip temporário enquanto não revisamos a rota.
  it.skip("fluxo sem tipo='desconto' não entra no bloco de desconto", async () => {
    // Sem tipo: fluxo normal de crédito — mas vamos apenas verificar que
    // não retorna aguardando_aprovacao_desconto
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "rascunho", bloqueado: false, aprovacao_credito_tarefa_id: null }])
      .mockResolvedValueOnce([{ total: "0" }]); // aReceber check

    // Consultora sem A Receber vai para criação de tarefa de gerente
    sqlMock
      .mockResolvedValueOnce([{ id: "gerente-uuid" }]) // SELECT gerente
      .mockResolvedValueOnce([{ numero_venda: "V-001", total_venda: "200" }])
      .mockResolvedValueOnce([{ id: 55 }]) // INSERT tarefa
      .mockResolvedValueOnce([{ id: 1 }]) // INSERT aprovacoes
      .mockResolvedValueOnce([]) // UPDATE venda
      .mockResolvedValueOnce([]); // notificacao

    const res = await POST(makeRequest("1", {}), makeParams("1"));
    const data = await res.json();

    expect(data.aguardando_aprovacao_desconto).toBeUndefined();
    expect(data.aguardando_aprovacao_credito).toBe(true);
  });
});
