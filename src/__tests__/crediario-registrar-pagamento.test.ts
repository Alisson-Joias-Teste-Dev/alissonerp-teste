/**
 * Testes da rota POST /api/crediario/[id]/registrar-pagamento
 *
 * Cobre as 7 regras de ouro do módulo crediário (AGENTS.md):
 *  REGRA #1 — Toda baixa devolve saldo ao gerente
 *  REGRA #2 — Toda baixa toca em contas_receber + comunicacoes_crediario
 *  REGRA #3 — Campo gateway preenchido com forma_recebimento
 *  REGRA #4 — Foto do ouro obrigatória + proxy storage (testado indiretamente)
 *  REGRA #5 — Ouro: peso, valor/grama e foto_path salvos no pagamento
 *  REGRA #6 — Split de crédito: parcial → nova conta + novo pagamento
 *  REGRA #7 — View vw_crediario mantida compatível (teste de integração)
 *
 * Fluxo de queries (em ordem):
 *  Q1: SELECT role FROM usuarios
 *  Q2: SELECT conta FROM contas_receber
 *  Q3: SELECT pagamento FROM pagamentos_venda
 *  ── BEGIN TX ──
 *  Q4: UPDATE contas_receber SET situacao='pago'
 *  Q5: INSERT nova contas_receber (se parcial)
 *  Q6: UPDATE pagamentos_venda SET status='confirmado'
 *  Q7: INSERT novo pagamento_venda (se parcial)
 *  Q8: INSERT comunicacoes_crediario
 *  Q9: logAudit → INSERT auditoria
 *  ── COMMIT ──
 *  Q10: SELECT credito_gerente_usado FROM vendas_erp
 *  Q11: UPDATE vendas_erp credito_gerente_usado (se devolve saldo)
 *  Q12: SELECT COUNT pendentes
 *  Q13: SELECT situacao FROM vendas_erp
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  // mock do sql.begin: executa o callback passando o próprio sqlMock como tx
  begin: vi.fn(),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockCreditarSaldo = vi.fn();
vi.mock("@/lib/saldo-credito", () => ({
  creditarSaldo: (...args: unknown[]) => mockCreditarSaldo(...args),
}));

const mockConcluirVenda = vi.fn();
vi.mock("@/lib/vendas-aprovar", () => ({
  concluirVenda: (...args: unknown[]) => mockConcluirVenda(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import(
  "@/app/api/crediario/[id]/registrar-pagamento/route"
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID = "user-uuid-456";
const CONTA_ID = 10;
const VENDA_ID = 55;
const PAGAMENTO_ID = 88;

function makeRequest(body?: Record<string, unknown>) {
  const req = new NextRequest(
    `http://localhost/api/crediario/${CONTA_ID}/registrar-pagamento`,
    {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return req;
}

function makeParams(id: number = CONTA_ID) {
  return { params: Promise.resolve({ id: String(id) }) };
}

/** Simula o sql.begin executando o callback com tx=sqlMock */
function setupBegin() {
  sqlMock.begin.mockImplementation(async (cb: (tx: typeof sqlMock) => Promise<void>) => {
    await cb(sqlMock);
  });
}

// ── Helpers de setup ──────────────────────────────────────────────────────────

interface SetupOptions {
  role?: string;
  contaEncontrada?: boolean;
  contaSituacao?: string;
  contaValor?: string | number;
  contaDescricao?: string;
  vendaId?: number;
  pagamentoEncontrado?: boolean;
  pagamentoValor?: string | number;
  formaRecebimento?: string | null;
  valorPago?: number | null;
  ouroPeso?: number | null;
  ouroValorGrama?: number | null;
  ouroFotoPath?: string | null;
  creditoGerente?: number;
  situacaoVenda?: string;
  pendentesAposUpdate?: number;
}

function setupQueries(opts: SetupOptions = {}) {
  const {
    role = "admin",
    contaEncontrada = true,
    contaSituacao = "pendente",
    contaValor = "1500",
    contaDescricao = "Venda #123",
    vendaId = VENDA_ID,
    pagamentoEncontrado = true,
    pagamentoValor = "1500",
    formaRecebimento = "Dinheiro",
    valorPago = null,
    ouroPeso = null,
    ouroValorGrama = null,
    ouroFotoPath = null,
    creditoGerente = 0,
    situacaoVenda = "aprovado",
    pendentesAposUpdate = 0,
  } = opts;

  const valorEfetivo = valorPago ?? Number(contaValor);
  const ehPagamentoParcial = valorEfetivo < Number(contaValor);

  // Q1: SELECT role
  sqlMock.mockResolvedValueOnce([{ role }]);

  // Q2: SELECT conta
  if (!contaEncontrada) {
    sqlMock.mockResolvedValueOnce([]);
    return;
  }
  sqlMock.mockResolvedValueOnce([{
    id: CONTA_ID,
    situacao: contaSituacao,
    valor: contaValor,
    venda_erp_id: vendaId,
    descricao: contaDescricao,
  }]);

  // Se conta já paga ou status inválido → não chega nas próximas queries
  if (contaSituacao !== "pendente") return;

  // Q3: SELECT pagamento
  if (vendaId) {
    if (pagamentoEncontrado) {
      sqlMock.mockResolvedValueOnce([{
        id: PAGAMENTO_ID,
        valor: pagamentoValor,
        forma: "A Receber",
      }]);
    } else {
      sqlMock.mockResolvedValueOnce([]);
    }
  } else {
    sqlMock.mockResolvedValueOnce([]);
  }

  // TX interna (sql.begin):
  setupBegin();

  // Dentro da TX (ordem real do route.ts):
  //  Passo 1:  UPDATE contas_receber
  //  Passo 1b: INSERT nova contas_receber (se parcial)
  //  Passo 2:  UPDATE pagamentos_venda (se total)
  //  Passo 2b: UPDATE pagamentos_venda (se parcial) + INSERT novo pagamento_venda
  //  Passo 3:  INSERT comunicacoes_crediario

  // Passo 1 (tx): UPDATE contas_receber
  sqlMock.mockResolvedValueOnce([]);

  // Passo 1b (tx): INSERT nova contas_receber (se parcial)
  if (ehPagamentoParcial) {
    sqlMock.mockResolvedValueOnce([{ id: CONTA_ID + 100 }]);
  }

  // Passo 2 (tx): UPDATE pagamentos_venda (total) OU Passo 2b (tx): UPDATE pagamentos_venda (parcial)
  if (pagamentoEncontrado) {
    sqlMock.mockResolvedValueOnce([]);

    // Passo 2b (tx): INSERT novo pagamento_venda (se parcial)
    if (ehPagamentoParcial) {
      sqlMock.mockResolvedValueOnce([]);
    }
  }

  // Passo 3 (tx): INSERT comunicacoes_crediario
  sqlMock.mockResolvedValueOnce([]);
  // logAudit → não quebra se não mockar

  // ── Fora da TX ──

  // Q10: SELECT credito_gerente_usado
  sqlMock.mockResolvedValueOnce([{ credito_gerente_usado: String(creditoGerente) }]);

  if (creditoGerente > 0 && vendaId && pagamentoEncontrado) {
    // Q11: UPDATE vendas_erp credito_gerente_usado
    sqlMock.mockResolvedValueOnce([]);
  }

  // Q12: SELECT COUNT pendentes
  sqlMock.mockResolvedValueOnce([{ cnt: pendentesAposUpdate }]);

  // Q13: SELECT situacao vendas_erp (só se vendaId)
  if (vendaId) {
    sqlMock.mockResolvedValueOnce([{ situacao: situacaoVenda }]);
  }
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST /api/crediario/[id]/registrar-pagamento", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    sqlMock.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockCreditarSaldo.mockResolvedValue(undefined);
    mockConcluirVenda.mockResolvedValue(undefined);
  });

  // ═══ AUTENTICAÇÃO E PERMISSÃO ═══════════════════════════════════════════════

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("retorna 403 quando usuário não existe na tabela usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permissão/i);
  });

  it("retorna 403 quando role não está na lista permitida", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it("aceita role 'gerente_loja'", async () => {
    setupQueries({ role: "gerente_loja" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("aceita role 'diretor'", async () => {
    setupQueries({ role: "diretor" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("aceita role 'desenvolvedor'", async () => {
    setupQueries({ role: "desenvolvedor" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  // ═══ VALIDAÇÃO DE ID ════════════════════════════════════════════════════════

  it("retorna 400 quando id não é numérico", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  // ═══ CONTA ══════════════════════════════════════════════════════════════════

  it("retorna 404 quando conta não encontrada", async () => {
    setupQueries({ contaEncontrada: false });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("retorna ok com ja_pago quando conta já está paga", async () => {
    setupQueries({ contaSituacao: "pago" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.ja_pago).toBe(true);
  });

  it("retorna 409 quando conta está em status diferente de pendente", async () => {
    setupQueries({ contaSituacao: "cancelado" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
  });

  // ═══ REGRA DE OURO #1 — DEVOLVE SALDO AO GERENTE ═══════════════════════════

  it("devolve saldo ao gerente quando credito_gerente_usado > 0", async () => {
    setupQueries({
      creditoGerente: 1500,
      pagamentoValor: "1500",
      valorPago: 1500,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockCreditarSaldo).toHaveBeenCalledTimes(1);
    expect(mockCreditarSaldo).toHaveBeenCalledWith(1500, VENDA_ID, PAGAMENTO_ID, USER_ID);
    expect(data.saldo_devolvido).toBe(true);
  });

  it("devolve saldo proporcional quando valor pago < crédito usado", async () => {
    setupQueries({
      creditoGerente: 2000,
      pagamentoValor: "2000",
      valorPago: 800,
    });

    await POST(makeRequest({ valor_pago: 800 }), makeParams());

    expect(mockCreditarSaldo).toHaveBeenCalledWith(800, VENDA_ID, PAGAMENTO_ID, USER_ID);
  });

  it("limita devolução ao valor pago quando pago < crédito", async () => {
    setupQueries({
      contaValor: "2000",
      creditoGerente: 5000,
      pagamentoValor: "2000",
      valorPago: 2000,
    });

    await POST(makeRequest({ valor_pago: 2000 }), makeParams());

    expect(mockCreditarSaldo).toHaveBeenCalledWith(2000, VENDA_ID, PAGAMENTO_ID, USER_ID);
  });

  it("NÃO devolve saldo quando credito_gerente_usado = 0", async () => {
    setupQueries({
      creditoGerente: 0,
      valorPago: 1500,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockCreditarSaldo).not.toHaveBeenCalled();
    expect(data.saldo_devolvido).toBe(false);
  });

  // ═══ REGRA DE OURO #2 — BAIXA CONTAS_RECEBER + COMUNICAÇÃO ══════════════════

  it("marca contas_receber como pago dentro da transação", async () => {
    setupQueries({ valorPago: 1500 });

    await POST(makeRequest(), makeParams());

    // Verifica que UPDATE contas_receber foi chamado com situacao='pago'
    const updateCalls = sqlMock.mock.calls.filter(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("contas_receber") && parts.includes("situacao");
    });
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it("insere em comunicacoes_crediario com tipo 'aviso_recebimento'", async () => {
    setupQueries({ formaRecebimento: "Dinheiro", valorPago: 1500 });

    await POST(makeRequest(), makeParams());

    const comCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("comunicacoes_crediario") && parts.includes("aviso_recebimento");
    });
    expect(comCall).toBeDefined();
  });

  // ═══ REGRA DE OURO #3 — GATEWAY PREENCHIDO ═════════════════════════════════

  it("preenche gateway com a forma_recebimento no UPDATE pagamentos_venda", async () => {
    setupQueries({ formaRecebimento: "Pix", valorPago: 1500 });

    await POST(makeRequest({ forma_recebimento: "Pix" }), makeParams());

    const gatewayCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("pagamentos_venda") && parts.includes("gateway");
    });
    expect(gatewayCall).toBeDefined();
  });

  // ═══ REGRA DE OURO #5 — OURO: PESO, GRAMA, FOTO ════════════════════════════

  it("salva ouro_peso, ouro_valor_grama e ouro_foto_path no pagamento", async () => {
    setupQueries({
      formaRecebimento: "Ouro",
      valorPago: 1000,
      ouroPeso: 2.5,
      ouroValorGrama: 400,
      ouroFotoPath: "crediario/10/1716300000.jpg",
    });

    await POST(makeRequest({
      forma_recebimento: "Ouro",
      valor_pago: 1000,
      ouro_peso: 2.5,
      ouro_valor_grama: 400,
      ouro_foto_path: "crediario/10/1716300000.jpg",
    }), makeParams());

    const ouroCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("ouro_peso") && parts.includes("ouro_valor_grama") && parts.includes("ouro_foto_path");
    });
    expect(ouroCall).toBeDefined();
  });

  // ═══ REGRA DE OURO #6 — SPLIT DE CRÉDITO (PAGAMENTO PARCIAL) ══════════════

  it("faz split: cria nova contas_receber quando pagamento parcial", async () => {
    setupQueries({
      contaValor: "1500",
      valorPago: 900,
    });

    await POST(makeRequest({ valor_pago: 900 }), makeParams());

    // Deve ter INSERT em contas_receber (nova conta com restante)
    const insertCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join("") : String(call[0] ?? ""));
      return parts.includes("INSERT") && parts.includes("contas_receber") && parts.includes("venda_erp_id");
    });
    expect(insertCall).toBeDefined();
  });

  it("faz split: cria novo pagamento_venda pendente quando parcial", async () => {
    setupQueries({
      contaValor: "2000",
      valorPago: 500,
    });

    await POST(makeRequest({ valor_pago: 500 }), makeParams());

    const insertPagCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("INSERT") && parts.includes("pagamentos_venda") && parts.includes("A Receber");
    });
    expect(insertPagCall).toBeDefined();
  });

  it("atualiza conta original com valor pago no split", async () => {
    setupQueries({
      contaValor: "3000",
      valorPago: 1200,
    });

    await POST(makeRequest({ valor_pago: 1200 }), makeParams());

    const valorCall = sqlMock.mock.calls.find(call => {
      const parts = (Array.isArray(call[0]) ? call[0].join(" ") : String(call[0] ?? ""));
      return parts.includes("contas_receber") && parts.includes("valor");
    });
    expect(valorCall).toBeDefined();
  });

  it("retorna pagamento_parcial e valor_restante na resposta", async () => {
    setupQueries({
      contaValor: "1000",
      valorPago: 300,
    });

    const res = await POST(makeRequest({ valor_pago: 300 }), makeParams());
    const data = await res.json();

    expect(data.pagamento_parcial).toBe(true);
    expect(data.valor_pago).toBe(300);
    expect(data.valor_restante).toBe(700);
    expect(data.novo_credito_id).toBeDefined();
  });

  // ═══ PAGAMENTO TOTAL (SEM SPLIT) ════════════════════════════════════════════

  it("confirma pagamento normalmente quando valor pago = total", async () => {
    setupQueries({
      contaValor: "1500",
      valorPago: 1500,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.pagamento_parcial).toBeUndefined();
    expect(data.valor_restante).toBeUndefined();
    expect(data.ok).toBe(true);
  });

  // ═══ AUTO-CONCLUSÃO DA VENDA — APOSENTADA (fluxo novo 06/2026) ═══════════════
  // Pagamento quitado NÃO conclui mais a venda: o status só muda na entrega
  // (em_rota → entregue). concluirVenda() foi removida da lib.

  it("NÃO conclui venda mesmo com todos pagamentos confirmados e venda aprovada (fluxo novo)", async () => {
    setupQueries({
      situacaoVenda: "aprovado",
      pendentesAposUpdate: 0,
      valorPago: 1500,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockConcluirVenda).not.toHaveBeenCalled();
    expect(data.ok).toBe(true);
    expect(data).not.toHaveProperty("venda_concluida");
  });

  it("NÃO conclui venda quando ainda há pagamentos pendentes", async () => {
    setupQueries({
      situacaoVenda: "aprovado",
      pendentesAposUpdate: 2,
      valorPago: 1500,
    });

    await POST(makeRequest(), makeParams());

    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("NÃO conclui venda quando situação != 'aprovado'", async () => {
    setupQueries({
      situacaoVenda: "rascunho",
      pendentesAposUpdate: 0,
      valorPago: 1500,
    });

    await POST(makeRequest(), makeParams());

    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  // ═══ VALIDAÇÕES DE INPUT ═══════════════════════════════════════════════════

  it("retorna 400 quando valor_pago > valor da conta", async () => {
    setupQueries({
      contaValor: "1000",
      valorPago: 2000,
    });

    const res = await POST(makeRequest({ valor_pago: 2000 }), makeParams());
    expect(res.status).toBe(400);
  });

  // ═══ RESPOSTA ═══════════════════════════════════════════════════════════════

  it("resposta inclui todas as flags esperadas", async () => {
    setupQueries({ valorPago: 1500 });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("saldo_devolvido");
    // venda_concluida saiu da resposta — fluxo novo 06/2026 (pagamento não muda status)
    expect(data).not.toHaveProperty("venda_concluida");
    expect(data).toHaveProperty("valor_pago");
  });
});
