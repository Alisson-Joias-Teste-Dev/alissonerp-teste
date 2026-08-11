/**
 * Testes da rota POST /api/vendas/[id]/pagamentos/[pagId]/confirmar
 *
 * Verifica:
 *  1. Auth (401)
 *  2. Permissão (403)
 *  3. Pagamento não encontrado (404)
 *  4. Pagamento já confirmado (ok + ja_confirmado:true)
 *  5. Pagamento em status inválido (409)
 *  6. "A Receber" é redirecionado pro Crediário (409 + usar_crediario) — porta
 *     única de baixa (redesenho 19/06/2026), a rota nem entra na transação.
 *  7. UPDATE status='confirmado', data_confirmacao=NOW
 *  8. Atualiza contas_receber
 *  9. Auto-aprovação: rascunho + aprovacao_credito_tipo + outros confirmados → approveVenda
 * 10. Flags da resposta
 *
 * NOTA: não há mais teste de "auto-conclusão" (concluirVenda) nem de
 * creditarSaldo bem-sucedido — Fluxo novo 06/2026 removeu a conclusão
 * automática da venda por aqui (só muda na entrega), e a devolução de
 * crédito do gerente por "A Receber" ficou inalcançável nesta rota desde
 * que "A Receber" passou a ser bloqueado antes da transação.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  // A rota usa sql.begin(tx => ...) — o callback recebe o próprio sqlMock,
  // então dentro e fora da transação consomem a MESMA fila de mocks.
  begin: (fn: (tx: unknown) => Promise<unknown>) => fn(sqlMock),
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
vi.mock("@/lib/vendas-aprovar", () => ({
  approveVenda: (...args: unknown[]) => mockApproveVenda(...args),
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
 * Sequência de queries na rota (sql e tx caem na mesma fila — ver mock acima):
 *   Q1  SELECT role
 *   Q2  SELECT pagamento (pré-checagem, fora da tx)
 *   -- forma "A Receber" → 409 aqui, sem entrar na tx --
 *   -- status != "pendente" → retorno cedo aqui, sem entrar na tx --
 *   Q3  SELECT pagamento FOR UPDATE (dentro da tx, mesma linha de Q2)
 *   Q4  UPDATE pagamentos_venda (confirma)              — valor não importa
 *   Q5  SELECT credito_gerente_usado + situacao FOR UPDATE
 *   Q6  UPDATE contas_receber (pagamento total)          — valor não importa
 *   Q7  INSERT audit_log (logAudit, tem try/catch próprio) — valor não importa
 *   -- fim da tx --
 *   Q8  SELECT COUNT pendentes
 *   Q9  SELECT aprovacao_credito_tipo            (só se situacao === "rascunho")
 *   Q10 SELECT COUNT outros pendentes            (só se Q9 retornou tipo)
 *   Q11 SELECT desconto_revalidacao/aprovado_por (só se Q10.cnt === 0)
 *   Q12 getDescontoThreshold (query própria, não mockada aqui — usa default [])
 *   Q13 SELECT EXISTS temAltoDesc                (mesma condição de Q11)
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

  // Q2: SELECT pagamento (pré-checagem)
  if (!pagamentoEncontrado) {
    sqlMock.mockResolvedValueOnce([]);
    return;
  }
  const pagamentoRow = {
    id: PAG_ID, venda_id: VENDA_ID, forma: pagamentoForma,
    valor: pagamentoValor, status: pagamentoStatus,
  };
  sqlMock.mockResolvedValueOnce([pagamentoRow]);

  // "A Receber" é redirecionado pro Crediário ANTES da tx (porta única).
  if (pagamentoForma === "A Receber") return;
  // Confirmado/cancelado retornam cedo, sem entrar na tx.
  if (pagamentoStatus !== "pendente") return;

  // Q3: SELECT pagamento FOR UPDATE (dentro da tx)
  sqlMock.mockResolvedValueOnce([pagamentoRow]);
  // Q4: UPDATE pagamentos_venda
  sqlMock.mockResolvedValueOnce([]);
  // Q5: SELECT credito_gerente_usado + situacao FOR UPDATE
  sqlMock.mockResolvedValueOnce([{
    credito_gerente_usado: String(creditoGerente),
    situacao,
  }]);
  // Q6: UPDATE contas_receber
  sqlMock.mockResolvedValueOnce([]);
  // Q7: INSERT audit_log (logAudit)
  sqlMock.mockResolvedValueOnce([]);

  // Q8: SELECT COUNT pendentes
  sqlMock.mockResolvedValueOnce([{ cnt: pendentesAposUpdate }]);

  // Q9/Q10/Q11/Q13: só rodam se situacao === "rascunho"
  if (situacao === "rascunho") {
    sqlMock.mockResolvedValueOnce([{ aprovacao_credito_tipo: aprovacaoCreditoTipo }]);
    if (aprovacaoCreditoTipo) {
      sqlMock.mockResolvedValueOnce([{ cnt: outrosPendentes }]);
      if (outrosPendentes === 0) {
        sqlMock.mockResolvedValueOnce([{
          desconto_revalidacao_necessaria: false,
          desconto_aprovado_por: "someone",
        }]);
        // Q12 getDescontoThreshold usa o default (mockResolvedValue([]))
        sqlMock.mockResolvedValueOnce([{ tem: false }]);
      }
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

  // ── 7. "A Receber" — porta única no Crediário ───────────────────────────────

  it("redireciona pro Crediário quando forma é 'A Receber' (não entra na transação)", async () => {
    setupQueries({ pagamentoForma: "A Receber" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.usar_crediario).toBe(true);
    expect(mockCreditarSaldo).not.toHaveBeenCalled();
  });

  // ── 8. Confirmação básica: UPDATE ───────────────────────────────────────────

  it("executa UPDATE status='confirmado' e data_confirmacao=NOW()", async () => {
    setupQueries({ pendentesAposUpdate: 1 }); // não totalmente paga (sem auto-aprovação)
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
    expect(sqlText).toMatch(/status/);
    expect(sqlText).toMatch(/pago/);
    expect(sqlText).toMatch(/data_recebimento/);
  });

  // ── 10. Auto-aprovação ──────────────────────────────────────────────────────

  it("auto-aprova venda em rascunho quando há aprovacao_credito_tipo + outros pagamentos confirmados", async () => {
    setupQueries({
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

  // ── 11. Flags da resposta ───────────────────────────────────────────────────

  it("resposta inclui as flags: ok, saldo_devolvido, venda_aprovada, todos_pagos", async () => {
    setupQueries({ pendentesAposUpdate: 1 });
    const res = await POST(makeRequest(), makeParams());
    const data = await res.json();

    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("saldo_devolvido");
    expect(data).toHaveProperty("venda_aprovada");
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
