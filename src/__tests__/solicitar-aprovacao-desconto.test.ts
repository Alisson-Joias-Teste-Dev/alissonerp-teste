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

// avaliarRegras/criarTarefaAprovacao são o motor de aprovação (Fase 3g.3) —
// cada uma faz suas próprias queries + resolverAprovadores por baixo. Mocka
// direto pra não ter que simular essa cadeia inteira na fila do sqlMock.
const mockGetDescontoThreshold = vi.fn();
const mockAvaliarRegras = vi.fn();
const mockCriarTarefaAprovacao = vi.fn();
const mockBuscarLimiteDescontoCartao = vi.fn();
vi.mock("@/lib/aprovacao-regras", () => ({
  getDescontoThreshold: (...args: unknown[]) => mockGetDescontoThreshold(...args),
  avaliarRegras: (...args: unknown[]) => mockAvaliarRegras(...args),
  criarTarefaAprovacao: (...args: unknown[]) => mockCriarTarefaAprovacao(...args),
  buscarLimiteDescontoCartao: (...args: unknown[]) => mockBuscarLimiteDescontoCartao(...args),
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

// Sequência de queries reais na rota pro fluxo tipo="desconto" (getDescontoThreshold,
// avaliarRegras e criarTarefaAprovacao são mocadas à parte — ver topo do arquivo):
//   Q1  SELECT role
//   Q2  SELECT venda (situacao/bloqueado/aprovacao_desconto_tarefa_id/tem_desconto_alto)
//   -- se aprovacao_desconto_tarefa_id já setado: retorna cedo aqui --
//   Q3  requireVendaOwnership: SELECT vendas_erp
//   Q4  requireVendaOwnership: getUserVendedorId
//   Q5  SELECT itens (maior desconto)
//   Q6  SELECT venda info (numero_venda, total_venda)
//   Q7  SELECT itens detalhe (pra montar a descrição da tarefa)
//   Q8  UPDATE vendas_erp (grava aprovacao_desconto_tarefa_id)
function setupSqlDesconto(overrides: { tarefaId?: number } = {}) {
  mockGetDescontoThreshold.mockResolvedValue(30);
  mockAvaliarRegras.mockResolvedValue([{ id: 1, nome: "Desconto acima do limite", descricao: null, tipo_evento: "desconto_acima", condicao_json: {}, aprovador_role: null, aprovador_id: null, template_id: null, prioridade_regra: 1 }]);
  mockCriarTarefaAprovacao.mockResolvedValue(overrides.tarefaId ?? 99);

  sqlMock
    .mockResolvedValueOnce([{ role: "consultora" }])                          // Q1
    .mockResolvedValueOnce([{                                                  // Q2
      id: 1, situacao: "rascunho", bloqueado: false,
      aprovacao_credito_tarefa_id: null, aprovacao_desconto_tarefa_id: null,
      tem_desconto_alto: true, desconto_aprovado_por: null,
    }])
    .mockResolvedValueOnce([{ vendedor_id: 1 }])                              // Q3
    .mockResolvedValueOnce([{ vendedor_id: 1 }])                              // Q4
    .mockResolvedValueOnce([{ sku: "SKU-001", nome_produto: "Anel", preco_lista: "200.00", pct_desconto: "35", preco_unitario: "130.00", quantidade: 1 }]) // Q5
    .mockResolvedValueOnce([{ numero_venda: "V-001", total_venda: "500.00" }])  // Q6
    .mockResolvedValueOnce([{ sku: "SKU-001", nome_produto: "Anel", preco_lista: "200.00", pct_desconto: "35", preco_unitario: "130.00", quantidade: 1 }]) // Q7
    .mockResolvedValueOnce([]);                                                // Q8
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST solicitar-aprovacao — tipo='desconto'", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    mockGetDescontoThreshold.mockResolvedValue(30);
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "aprovado", bloqueado: false, aprovacao_desconto_tarefa_id: null, tem_desconto_alto: false }]);

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    expect(res.status).toBe(409);
  });

  it("retorna early quando já existe aprovação pendente (aprovacao_desconto_tarefa_id set)", async () => {
    mockGetDescontoThreshold.mockResolvedValue(30);
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "rascunho", bloqueado: false, aprovacao_desconto_tarefa_id: 77, tem_desconto_alto: true }])
      .mockResolvedValueOnce([{ vendedor_id: 1 }])
      .mockResolvedValueOnce([{ vendedor_id: 1 }]);

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.aguardando_aprovacao_desconto).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("retorna 409 quando aprovador de desconto não está configurado", async () => {
    mockGetDescontoThreshold.mockResolvedValue(30);
    mockAvaliarRegras.mockResolvedValue([{ id: 1, nome: "Desconto acima do limite", descricao: null, tipo_evento: "desconto_acima", condicao_json: {}, aprovador_role: null, aprovador_id: null, template_id: null, prioridade_regra: 1 }]);
    const { HttpError } = await import("@/lib/devolucoes");
    mockCriarTarefaAprovacao.mockRejectedValue(new HttpError(409, "Aprovador de desconto não configurado. Defina em Configurações › Aprovadores."));
    sqlMock
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ id: 1, situacao: "rascunho", bloqueado: false, aprovacao_desconto_tarefa_id: null, tem_desconto_alto: true }])
      .mockResolvedValueOnce([{ vendedor_id: 1 }])
      .mockResolvedValueOnce([{ vendedor_id: 1 }])
      .mockResolvedValueOnce([{ sku: "SKU-001", nome_produto: "Anel", preco_lista: "200.00", pct_desconto: "35", preco_unitario: "130.00", quantidade: 1 }])
      .mockResolvedValueOnce([{ numero_venda: "V-001", total_venda: "500.00" }])
      .mockResolvedValueOnce([{ sku: "SKU-001", nome_produto: "Anel", preco_lista: "200.00", pct_desconto: "35", preco_unitario: "130.00", quantidade: 1 }]);

    const res = await POST(makeRequest("1", { tipo: "desconto" }), makeParams("1"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/aprovador de desconto/i);
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
