/**
 * Testes da rota POST /api/vendas/[id]/pagamentos/[pagId]/confirmar
 *
 * Verifica:
 *  1. Auth (401)
 *  2. Permissão (403)
 *  3. Pagamento não encontrado (404)
 *  4. Pagamento já confirmado (ok + ja_confirmado:true)
 *  5. Pagamento em status inválido (409)
 *  6. UPDATE status='confirmado', data_confirmacao=NOW
 *  7. Pagamento "A Receber" + crédito gerente: chama creditarSaldo
 *  8. Atualiza contas_receber
 *  9. Auto-aprovação: rascunho + aprovacao_credito_tipo + outros confirmados → approveVenda
 * 10. Auto-conclusão: aprovado + todos pagos → concluirVenda
 * 11. Flags da resposta
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

const mockCreditarSaldo = vi.fn();
vi.mock("@/lib/saldo-credito", () => ({
  creditarSaldo: (...args: unknown[]) => mockCreditarSaldo(...args),
}));

const mockApproveVenda = vi.fn();
const mockConcluirVenda = vi.fn();
vi.mock("@/lib/vendas-aprovar", () => ({
  approveVenda: (...args: unknown[]) => mockApproveVenda(...args),
  concluirVenda: (...args: unknown[]) => mockConcluirVenda(...args),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import(
  "@/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-123";
const VENDA_ID = 42;
const PAG_ID = 99;

function makeRequest() {
  return new NextRequest(
    `http://localhost/api/vendas/${VENDA_ID}/pagamentos/${PAG_ID}/confirmar`,
    { method: "POST" },
  );
}

function makeParams(id: number = VENDA_ID, pagId: number = PAG_ID) {
  return { params: Promise.resolve({ id: String(id), pagId: String(pagId) }) };
}

/**
 * Sequência de queries (em ordem) na rota:
 *   Q1: SELECT role FROM usuarios
 *   Q2: SELECT pagamento
 *   Q3: UPDATE pagamentos_venda SET status='confirmado'        (só se pagamento pendente)
 *   Q4: SELECT credito_gerente_usado, situacao FROM vendas_erp (só se pagamento pendente)
 *   Q5: UPDATE vendas_erp credito_gerente_usado                (só se devolveu saldo)
 *   Q6: UPDATE contas_receber                                  (sempre após Q4) — tem .catch()
 *   Q7: SELECT COUNT pendentes
 *   Q8: SELECT aprovacao_credito_tipo                          (só se !todosPagos && rascunho)
 *   Q9: SELECT COUNT outros pendentes (forma != A Receber)     (só se Q8 retornou tipo)
 */

interface SetupOptions {
  role?: string;
  pagamentoStatus?: string;
  pagamentoForma?: string;
  pagamentoValor?: string | number;
  pagamentoEncontrado?: boolean;
  creditoGerente?: number;
  situacao?: string;
  pendentesAposUpdate?: number;
  aprovacaoCreditoTipo?: string | null;
  outrosPendentes?: number;
}

function setupQueries(opts: SetupOptions = {}) {
  const {
    role = "admin",
    pagamentoStatus = "pendente",
    pagamentoForma = "Dinheiro",
    pagamentoValor = "500",
    pagamentoEncontrado = true,
    creditoGerente = 0,
    situacao = "rascunho",
    pendentesAposUpdate = 0,
    aprovacaoCreditoTipo = null,
    outrosPendentes = 0,
  } = opts;

  // Q1: SELECT role
  sqlMock.mockResolvedValueOnce([{ role }]);

  // Q2: SELECT pagamento
  if (!pagamentoEncontrado) {
    sqlMock.mockResolvedValueOnce([]);
    return;
  }
  sqlMock.mockResolvedValueOnce([{
    id: PAG_ID,
    venda_id: VENDA_ID,
    forma: pagamentoForma,
    valor: pagamentoValor,
    status: pagamentoStatus,
  }]);

  // Se já confirmado ou status inválido → não chega aqui
  if (pagamentoStatus !== "pendente") return;

  // Q3: UPDATE status='confirmado'
  sqlMock.mockResolvedValueOnce([]);

  // Q4: SELECT credito_gerente_usado, situacao
  sqlMock.mockResolvedValueOnce([{
    credito_gerente_usado: String(creditoGerente),
    situacao,
  }]);

  // Q5: UPDATE credito_gerente_usado (só se houve devolução)
  if (creditoGerente > 0 && pagamentoForma === "A Receber") {
    sqlMock.mockResolvedValueOnce([]);
  }

  // Q6: UPDATE contas_receber
  sqlMock.mockResolvedValueOnce([]);

  // Q7: SELECT COUNT pendentes
  sqlMock.mockResolvedValueOnce([{ cnt: pendentesAposUpdate }]);

  // Q8 e Q9: só rodam se !todosPagos && situacao === "rascunho"
  const todosPagos = Number(pendentesAposUpdate) === 0;
  if (!todosPagos && situacao === "rascunho") {
    sqlMock.mockResolvedValueOnce([{ aprovacao_credito_tipo: aprovacaoCreditoTipo }]);
    if (aprovacaoCreditoTipo) {
      sqlMock.mockResolvedValueOnce([{ cnt: outrosPendentes }]);
    }
  }
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST /api/vendas/[id]/pagamentos/[pagId]/confirmar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (sqlMock as unknown as { array: (a: unknown[]) => unknown[] }).array = (arr) => arr;
    sqlMock.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockCreditarSaldo.mockResolvedValue(undefined);
    mockApproveVenda.mockResolvedValue(undefined);
    mockConcluirVenda.mockResolvedValue(undefined);
  });

  // ── 1. Auth ─────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  // ── 2. Permissão ────────────────────────────────────────────────────────────

  it("retorna 403 quando usuário não existe na tabela usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]); // Q1: SELECT role retorna vazio
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/usuário/i);
  });

  it("retorna 403 quando role não está na lista permitida", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "consultora" }]);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/permissão/i);
  });

  it("aceita role 'desenvolvedor'", async () => {
    setupQueries({ role: "desenvolvedor" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  it("aceita role 'gerente_loja'", async () => {
    setupQueries({ role: "gerente_loja" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
  });

  // ── 3. Pagamento não encontrado ─────────────────────────────────────────────

  it("retorna 404 quando pagamento não existe", async () => {
    setupQueries({ pagamentoEncontrado: false });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/não encontrado/i);
  });

  // ── 4. Pagamento já confirmado ──────────────────────────────────────────────

  it("retorna ok com ja_confirmado:true quando pagamento já está confirmado", async () => {
    setupQueries({ pagamentoStatus: "confirmado" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.ja_confirmado).toBe(true);
  });

  // ── 5. Status inválido ──────────────────────────────────────────────────────

  it("retorna 409 quando pagamento está em status diferente de pendente/confirmado", async () => {
    setupQueries({ pagamentoStatus: "cancelado" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/pendente/i);
  });

  // ── 6. IDs inválidos ────────────────────────────────────────────────────────

  it("retorna 400 quando id não é numérico", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "abc", pagId: String(PAG_ID) }),
    });
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando pagId não é numérico", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: String(VENDA_ID), pagId: "xyz" }),
    });
    expect(res.status).toBe(400);
  });

  // ── 7. Confirmação básica: UPDATE ───────────────────────────────────────────

  it("executa UPDATE status='confirmado' e data_confirmacao=NOW()", async () => {
    setupQueries({ pendentesAposUpdate: 1 }); // não totalmente paga (sem auto-conclusão)
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);

    const updateCall = sqlMock.mock.calls.find((call) => {
      const parts = (call[0] as string[]).join(" ");
      return (
        parts.includes("UPDATE") &&
        parts.includes("pagamentos_venda") &&
        parts.includes("status") &&
        parts.includes("confirmado")
      );
    });
    expect(updateCall).toBeDefined();
    const sqlText = (updateCall![0] as string[]).join(" ");
    expect(sqlText).toMatch(/now\(\)/i);
    expect(sqlText).toMatch(/data_confirmacao/);
  });

  // ── 8. Crédito gerente devolvido ────────────────────────────────────────────

  it("chama creditarSaldo quando pagamento 'A Receber' e há crédito gerente usado", async () => {
    setupQueries({
      pagamentoForma: "A Receber",
      pagamentoValor: "300",
      creditoGerente: 500,
      pendentesAposUpdate: 1,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockCreditarSaldo).toHaveBeenCalledTimes(1);
    // valorDevolver = min(valor=300, credito=500) = 300
    expect(mockCreditarSaldo).toHaveBeenCalledWith(300, VENDA_ID, PAG_ID, USER_ID);
    expect(data.saldo_devolvido).toBe(true);
  });

  it("limita devolução ao crédito quando pagamento > crédito", async () => {
    setupQueries({
      pagamentoForma: "A Receber",
      pagamentoValor: "1000",
      creditoGerente: 200,
      pendentesAposUpdate: 1,
    });

    await POST(makeRequest(), makeParams());

    expect(mockCreditarSaldo).toHaveBeenCalledWith(200, VENDA_ID, PAG_ID, USER_ID);
  });

  it("NÃO chama creditarSaldo quando forma != 'A Receber'", async () => {
    setupQueries({
      pagamentoForma: "Dinheiro",
      pagamentoValor: "300",
      creditoGerente: 500,
      pendentesAposUpdate: 1,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockCreditarSaldo).not.toHaveBeenCalled();
    expect(data.saldo_devolvido).toBe(false);
  });

  it("NÃO chama creditarSaldo quando crédito gerente = 0", async () => {
    setupQueries({
      pagamentoForma: "A Receber",
      pagamentoValor: "300",
      creditoGerente: 0,
      pendentesAposUpdate: 1,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockCreditarSaldo).not.toHaveBeenCalled();
    expect(data.saldo_devolvido).toBe(false);
  });

  it("retorna saldo_devolvido=false quando creditarSaldo lança erro", async () => {
    // Setup manual: Q5 (UPDATE credito_gerente_usado) NÃO roda quando creditarSaldo rejeita
    // Q1 role
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    // Q2 pagamento
    sqlMock.mockResolvedValueOnce([{
      id: PAG_ID, venda_id: VENDA_ID, forma: "A Receber",
      valor: "300", status: "pendente",
    }]);
    // Q3 UPDATE pagamento
    sqlMock.mockResolvedValueOnce([]);
    // Q4 SELECT credito + situacao
    sqlMock.mockResolvedValueOnce([{ credito_gerente_usado: "500", situacao: "rascunho" }]);
    // Q5 NÃO roda (creditarSaldo rejeitou)
    // Q6 UPDATE contas_receber
    sqlMock.mockResolvedValueOnce([]);
    // Q7 COUNT pendentes
    sqlMock.mockResolvedValueOnce([{ cnt: 1 }]);
    // Q8 SELECT tipo (não tem aprovacao)
    sqlMock.mockResolvedValueOnce([{ aprovacao_credito_tipo: null }]);

    mockCreditarSaldo.mockRejectedValueOnce(new Error("saldo error"));

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.saldo_devolvido).toBe(false);
  });

  // ── 9. contas_receber atualizada ────────────────────────────────────────────

  it("atualiza contas_receber: situacao='pago' e data_recebimento", async () => {
    setupQueries({ pendentesAposUpdate: 1 });
    await POST(makeRequest(), makeParams());

    const updateCall = sqlMock.mock.calls.find((call) => {
      const parts = (call[0] as string[]).join(" ");
      return parts.includes("UPDATE") && parts.includes("contas_receber");
    });
    expect(updateCall).toBeDefined();
    const sqlText = (updateCall![0] as string[]).join(" ");
    expect(sqlText).toMatch(/situacao/);
    expect(sqlText).toMatch(/pago/);
    expect(sqlText).toMatch(/data_recebimento/);
  });

  // ── 10. Auto-aprovação ──────────────────────────────────────────────────────

  it("auto-aprova venda em rascunho quando há aprovacao_credito_tipo + outros pagamentos confirmados", async () => {
    setupQueries({
      pagamentoForma: "A Receber",
      situacao: "rascunho",
      pendentesAposUpdate: 1, // ainda há pendente (o A Receber dos próximos meses)
      aprovacaoCreditoTipo: "diretor",
      outrosPendentes: 0,     // nenhum não-A Receber pendente
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockApproveVenda).toHaveBeenCalledTimes(1);
    expect(mockApproveVenda).toHaveBeenCalledWith(
      VENDA_ID,
      USER_ID,
      { tinyBestEffort: true },
    );
    expect(data.venda_aprovada).toBe(true);
  });

  it("NÃO auto-aprova quando situação != rascunho", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 1,
      aprovacaoCreditoTipo: "diretor",
    });

    await POST(makeRequest(), makeParams());

    expect(mockApproveVenda).not.toHaveBeenCalled();
  });

  it("NÃO auto-aprova quando aprovacao_credito_tipo é null", async () => {
    setupQueries({
      situacao: "rascunho",
      pendentesAposUpdate: 1,
      aprovacaoCreditoTipo: null,
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockApproveVenda).not.toHaveBeenCalled();
    expect(data.venda_aprovada).toBe(false);
  });

  it("NÃO auto-aprova quando há pagamentos não-A Receber pendentes", async () => {
    setupQueries({
      situacao: "rascunho",
      pendentesAposUpdate: 2,
      aprovacaoCreditoTipo: "diretor",
      outrosPendentes: 1, // ainda tem dinheiro/cartão pendente
    });

    await POST(makeRequest(), makeParams());

    expect(mockApproveVenda).not.toHaveBeenCalled();
  });

  it("retorna venda_aprovada=false quando approveVenda lança erro", async () => {
    setupQueries({
      situacao: "rascunho",
      pendentesAposUpdate: 1,
      aprovacaoCreditoTipo: "diretor",
      outrosPendentes: 0,
    });
    mockApproveVenda.mockRejectedValueOnce(new Error("approve fail"));

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.venda_aprovada).toBe(false);
  });

  // ── 11. Auto-conclusão ──────────────────────────────────────────────────────

  it("auto-conclui venda em situação 'aprovado' quando todos os pagamentos estão confirmados", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 0, // todosPagos
    });

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(mockConcluirVenda).toHaveBeenCalledTimes(1);
    expect(mockConcluirVenda).toHaveBeenCalledWith(
      VENDA_ID,
      USER_ID,
      { tinyBestEffort: true },
    );
    expect(data.venda_concluida).toBe(true);
    expect(data.todos_pagos).toBe(true);
  });

  it("NÃO auto-conclui quando situacao != 'aprovado'", async () => {
    setupQueries({
      situacao: "rascunho",
      pendentesAposUpdate: 0,
    });

    await POST(makeRequest(), makeParams());

    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("NÃO auto-conclui quando ainda há pagamentos pendentes", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 1,
    });

    await POST(makeRequest(), makeParams());

    expect(mockConcluirVenda).not.toHaveBeenCalled();
  });

  it("retorna venda_concluida=false quando concluirVenda lança erro", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 0,
    });
    mockConcluirVenda.mockRejectedValueOnce(new Error("concluir fail"));

    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.venda_concluida).toBe(false);
  });

  // ── 12. Flags da resposta ───────────────────────────────────────────────────

  it("resposta inclui todas as flags: ok, saldo_devolvido, venda_aprovada, venda_concluida, todos_pagos", async () => {
    setupQueries({ pendentesAposUpdate: 1 });
    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("saldo_devolvido");
    expect(data).toHaveProperty("venda_aprovada");
    expect(data).toHaveProperty("venda_concluida");
    expect(data).toHaveProperty("todos_pagos");
  });

  it("retorna todos_pagos=true quando count=0", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 0,
    });
    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.todos_pagos).toBe(true);
  });

  it("retorna todos_pagos=false quando count>0", async () => {
    setupQueries({
      situacao: "aprovado",
      pendentesAposUpdate: 3,
    });
    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data.todos_pagos).toBe(false);
  });
});
