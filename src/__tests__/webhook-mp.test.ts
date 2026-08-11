/**
 * Testes da rota POST /api/webhooks/mercado-pago
 *
 * Verifica:
 *  1. Webhook log: registra payload bruto sempre
 *  2. Validação HMAC (header ausente, inválido, válido)
 *  3. Idempotência (já confirmado, mesmo paymentId duas vezes)
 *  4. type=payment status=approved (UPDATE + concluirVenda quando quita)
 *  5. type=payment status=pending/in_process (mantém pendente)
 *  6. type=payment status=rejected (mantém pendente)
 *  7. type=payment status=refunded/cancelled/charged_back (estorna ou cancela)
 *  8. type=merchant_order (busca order, processa pagamento aprovado)
 *  9. external_reference inválido
 * 10. Pagamento não encontrado no banco
 * 11. Auto-aprovação venda rascunho com aprovacao_credito_tipo
 * 12. Erro ao concluir venda: pagamento JÁ confirmado (commit) — retorna 200
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// sqlMock funciona como tagged template: chamar sqlMock`...` é o mesmo que sqlMock(strings, ...values)
// Adicionamos .begin(callback) para simular sql.begin()
const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  // begin recebe um callback; nosso default executa o callback passando sqlMock como tx
  begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetWebhookSecret = vi.fn();
const mockGetAccessToken = vi.fn();
const mockFetchPayment = vi.fn();
const mockFetchMerchantOrder = vi.fn();
vi.mock("@/lib/mercado-pago", () => ({
  getWebhookSecret: mockGetWebhookSecret,
  getAccessToken: mockGetAccessToken,
  fetchPayment: mockFetchPayment,
  fetchMerchantOrder: mockFetchMerchantOrder,
}));

const mockApproveVenda = vi.fn();
const mockConcluirVenda = vi.fn();
const mockEstornarVenda = vi.fn();
vi.mock("@/lib/vendas-aprovar", () => ({
  approveVenda: mockApproveVenda,
  concluirVenda: mockConcluirVenda,
  estornarVenda: mockEstornarVenda,
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import("@/app/api/webhooks/mercado-pago/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "test-secret-123";
const SYSTEM_USER_ID = "system-user-uuid";
const VENDA_ID = 100;
const PAGAMENTO_ID = 200;
const PAYMENT_ID = "12345678";
const REQUEST_ID = "req-id-abc";

function buildSignature(dataId: string, requestId: string, secret: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return crypto.createHmac("sha256", secret).update(manifest).digest("hex");
}

interface MakeReqOpts {
  type?: string;
  dataId?: string;
  liveMode?: boolean;
  validHmac?: boolean;
  noHmac?: boolean;
  badHmac?: boolean;
  body?: Record<string, unknown>;
  action?: string;
  userId?: number;
}

function makeRequest(opts: MakeReqOpts = {}) {
  const {
    type = "payment",
    dataId = PAYMENT_ID,
    liveMode = true,
    validHmac = true,
    noHmac = false,
    badHmac = false,
    body,
    action,
    userId,
  } = opts;

  const url = new URL("http://localhost/api/webhooks/mercado-pago");
  url.searchParams.set("type", type);
  url.searchParams.set("data.id", dataId);

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!noHmac) {
    const ts = "1700000000";
    const v1 = badHmac
      ? "deadbeef".repeat(8) // 64 chars hex inválido
      : validHmac
        ? buildSignature(dataId, REQUEST_ID, WEBHOOK_SECRET, ts)
        : "0".repeat(64);
    headers["x-signature"] = `ts=${ts},v1=${v1}`;
    headers["x-request-id"] = REQUEST_ID;
  }

  const finalBody =
    body ??
    {
      type,
      data: { id: dataId },
      live_mode: liveMode,
      ...(action ? { action } : {}),
      ...(userId ? { user_id: userId } : {}),
    };

  return new NextRequest(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(finalBody),
  });
}

// Helper: identifica chamada SQL pela presença de uma keyword no template
function findSqlCall(keyword: string | RegExp) {
  return sqlMock.mock.calls.find(call => {
    const tpl = call[0];
    if (!Array.isArray(tpl)) return false;
    const joined = tpl.join(" ");
    return typeof keyword === "string"
      ? joined.includes(keyword)
      : keyword.test(joined);
  });
}

function findAllSqlCalls(keyword: string | RegExp) {
  return sqlMock.mock.calls.filter(call => {
    const tpl = call[0];
    if (!Array.isArray(tpl)) return false;
    const joined = tpl.join(" ");
    return typeof keyword === "string"
      ? joined.includes(keyword)
      : keyword.test(joined);
  });
}

// ── Setup mocks: sql.begin re-injetado por teste ──────────────────────────────
function resetSqlBegin() {
  sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(sqlMock));
}

// ── Testes ───────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/mercado-pago", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.mockResolvedValue([]);
    resetSqlBegin();
    mockGetWebhookSecret.mockResolvedValue(WEBHOOK_SECRET);
    mockGetAccessToken.mockResolvedValue("test-access-token");
    mockConcluirVenda.mockResolvedValue({ ok: true, cr_quitadas: 1 });
    mockApproveVenda.mockResolvedValue({ ok: true });
    mockEstornarVenda.mockResolvedValue({
      ok: true,
      acao: "revertida_rascunho",
      outros_confirmados: 1,
      cr_canceladas: 0,
    });
  });

  // ── 1. Webhook log sempre ─────────────────────────────────────────────────
  describe("Webhook log bruto", () => {
    it("registra payload bruto antes de qualquer validação", async () => {
      // ignored type, mas log deve acontecer
      const req = makeRequest({ type: "outro_tipo", noHmac: true });
      await POST(req);
      const logCall = findSqlCall("INSERT INTO alissonerp.webhook_log");
      expect(logCall).toBeDefined();
    });

    it("registra payload bruto mesmo sem HMAC", async () => {
      const req = makeRequest({ noHmac: true });
      sqlMock.mockResolvedValueOnce([]); // log inicial
      mockFetchPayment.mockRejectedValueOnce(new Error("forbidden"));
      await POST(req);
      const logs = findAllSqlCalls("INSERT INTO alissonerp.webhook_log");
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 2. Validação HMAC ─────────────────────────────────────────────────────
  describe("Validação HMAC", () => {
    // REGRA DE NEGÓCIO (endurecimento de segurança): o best-effort com fallback
    // ao access_token foi removido — o shortcut live_mode=false permitia bypass
    // total do HMAC. Agora, com secret configurado, assinatura ausente/inválida
    // SEMPRE rejeita com 401 (mas ainda registra o log antes de recusar).
    it("sem header x-signature: rejeita com 401 e LOGA a falha", async () => {
      const req = makeRequest({ noHmac: true });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const failLog = sqlMock.mock.calls.find(call => {
        const tpl = call[0];
        if (!Array.isArray(tpl)) return false;
        return tpl.join(" ").includes("INSERT INTO alissonerp.webhook_log") &&
          JSON.stringify(call.slice(1)).includes("hmac_check");
      });
      expect(failLog).toBeDefined();
      expect(mockFetchPayment).not.toHaveBeenCalled();
    });

    it("HMAC inválido: rejeita com 401 e LOGA a falha", async () => {
      const req = makeRequest({ badHmac: true });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const failLog = sqlMock.mock.calls.find(call => {
        const tpl = call[0];
        if (!Array.isArray(tpl)) return false;
        return tpl.join(" ").includes("INSERT INTO alissonerp.webhook_log") &&
          JSON.stringify(call.slice(1)).includes("hmac_check");
      });
      expect(failLog).toBeDefined();
      expect(mockFetchPayment).not.toHaveBeenCalled();
    });

    it("HMAC válido: prossegue sem log de fallback", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: "outro:formato",
      });
      const req = makeRequest({ validHmac: true });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const fallbackLog = sqlMock.mock.calls.find(call => {
        const tpl = call[0];
        if (!Array.isArray(tpl)) return false;
        return tpl.join(" ").includes("INSERT INTO alissonerp.webhook_log") &&
          JSON.stringify(call.slice(1)).includes("hmac_fallback");
      });
      expect(fallbackLog).toBeUndefined();
    });
  });

  // ── 3. Idempotência ────────────────────────────────────────────────────────
  describe("Idempotência", () => {
    it("pagamento já confirmado e mesmo paymentId: não reprocessa", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      // SELECT pagamento ERP — já confirmado e payment_id já processado
      sqlMock
        .mockResolvedValueOnce([]) // log inicial
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "confirmado",
          valor: 1000,
          gateway_payload: { payment_ids_processados: [PAYMENT_ID] },
        }]);
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.ja_processado).toBe(true);
      // sql.begin NUNCA deve ser chamado
      expect(sqlMock.begin).not.toHaveBeenCalled();
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("idempotência dentro da tx: ja_processado retornado pelo begin", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      // pre-check passa (status pendente), mas dentro do begin descobrimos
      // que outro processo já confirmou
      sqlMock
        .mockResolvedValueOnce([]) // log inicial
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);

      sqlMock.begin = vi.fn(async () => ({ ja_processado: true }));

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.ja_processado).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── 4. type=payment status=approved ────────────────────────────────────────
  describe("type=payment status=approved", () => {
    // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
    // o status só muda na entrega (em_rota → entregue).
    it("aprovado e quitado: confirma pagamento e NÃO conclui a venda (fluxo novo)", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
        transaction_details: { net_received_amount: 950 },
        fee_details: [{ amount: 50 }],
      });
      sqlMock
        .mockResolvedValueOnce([]) // log inicial
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);

      // Dentro do begin: retorna quitada=true
      sqlMock.begin = vi.fn(async () => ({ quitada: true, pago: 1000, total: 1000 }));

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.pagamento_quitado).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("aprovado mas pagamento parcial: confirma e NÃO chama concluirVenda", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 500,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 500,
          gateway_payload: {},
        }]);

      sqlMock.begin = vi.fn(async () => ({ quitada: false, pago: 500, total: 1000 }));

      // SELECT vendas_erp pra checar aprovacao_credito_tipo
      sqlMock
        .mockResolvedValueOnce([{ aprovacao_credito_tipo: null, situacao: "rascunho" }]);

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.pagamento_quitado).toBe(false);
      expect(data.pago).toBe(500);
      expect(data.total).toBe(1000);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("usa external_reference para extrair venda_id e pagamento_id", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:777:pag:888`,
        transaction_amount: 100,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: 888,
          venda_id: 777,
          status: "pendente",
          valor: 100,
          gateway_payload: {},
        }]);
      sqlMock.begin = vi.fn(async () => ({ quitada: false, pago: 100, total: 1000 }));
      sqlMock
        .mockResolvedValueOnce([{ aprovacao_credito_tipo: null, situacao: "rascunho" }]);

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.venda_id).toBe(777);
      expect(data.pagamento_id).toBe(888);
    });

    it("calcula valor_liquido e taxas_mp do net_received_amount", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
        transaction_details: { net_received_amount: 970.55 },
        fee_details: [{ amount: 29.45 }],
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);

      // Captura os valores que chegariam no UPDATE pagamentos_venda
      let capturedUpdate: unknown[] | null = null;
      sqlMock.begin = vi.fn(async (cb) => {
        const fakeTx = Object.assign(
          vi.fn((tpl: TemplateStringsArray, ...vals: unknown[]) => {
            const joined = Array.from(tpl).join(" ");
            if (joined.includes("UPDATE alissonerp.pagamentos_venda") &&
                joined.includes("SET")) {
              capturedUpdate = vals;
            }
            // SELECT pagTx
            // (a rota passou a ler tambem a `forma`, pro fechamento da parcela
            // do crediario — casar por prefixo evita quebrar de novo por coluna nova)
            if (joined.includes("SELECT id, status") && joined.includes("gateway_payload")) {
              return Promise.resolve([{
                id: PAGAMENTO_ID,
                status: "pendente",
                gateway_payload: {},
              }]);
            }
            // SELECT outros
            if (joined.includes("soma_outros")) {
              return Promise.resolve([{ soma_outros: 0, total_venda_local: 1000 }]);
            }
            // SELECT soma_confirmados
            if (joined.includes("soma_confirmados")) {
              return Promise.resolve([{ soma_confirmados: 1000, total_venda: 1000 }]);
            }
            return Promise.resolve([]);
          }),
        );
        return cb(fakeTx);
      });

      sqlMock
        .mockResolvedValueOnce([{ valor: JSON.stringify(SYSTEM_USER_ID) }]);

      await POST(makeRequest());
      expect(capturedUpdate).not.toBeNull();
      // valorLiquido = 970.55, taxasMP = 1000 - 970.55 = 29.45
      expect(capturedUpdate).toContain(970.55);
      expect(capturedUpdate).toContain(29.45);
      expect(capturedUpdate).toContain(PAYMENT_ID); // gateway_id
    });

    it("ja_coberto: outros pagamentos já cobrem total — quitada, sem conclusão (fluxo novo)", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 500,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 500,
          gateway_payload: {},
        }]);

      // begin retorna ja_coberto
      sqlMock.begin = vi.fn(async () => ({
        quitada: true,
        ja_coberto: true,
        pago: 1000,
        total: 1000,
      }));

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.pagamento_quitado).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── 5. type=payment status=pending/in_process ─────────────────────────────
  describe("type=payment status=pending/in_process", () => {
    it("status=pending: atualiza payload, mantém pendente", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "pending",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.pending).toBe(true);
      expect(data.status).toBe("pending");

      // Deve ter UPDATE só do gateway_payload (sem mexer em status)
      const updates = findAllSqlCalls("UPDATE alissonerp.pagamentos_venda");
      const hasPayloadOnlyUpdate = updates.some(call => {
        const tpl = (call[0] as string[]).join(" ");
        return tpl.includes("gateway_payload") && !tpl.includes("status");
      });
      expect(hasPayloadOnlyUpdate).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("status=in_process: idem pending", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "in_process",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.pending).toBe(true);
      expect(data.status).toBe("in_process");
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── 6. type=payment status=rejected ───────────────────────────────────────
  describe("type=payment status=rejected", () => {
    it("status=rejected: atualiza payload, mantém pendente", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "rejected",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.rejected).toBe(true);
      expect(data.status).toBe("rejected");
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── 7. type=payment status=refunded/cancelled/charged_back ────────────────
  describe("type=payment status=refunded/cancelled/charged_back", () => {
    it("refunded e pagamento estava confirmado: chama estornarVenda", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "refunded",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "confirmado",
          valor: 1000,
          gateway_payload: {},
        }]);
      // Mock do begin: re-leitura dentro de tx confirma "confirmado"
      sqlMock.begin = vi.fn(async () => "confirmado");
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.estornado).toBe(true);
      expect(data.acao).toBe("revertida_rascunho");
      expect(mockEstornarVenda).toHaveBeenCalledWith(
        VENDA_ID,
        PAGAMENTO_ID,
        expect.objectContaining({ status_mp: "refunded" }),
      );
    });

    it("cancelled e pagamento estava pendente: marca como cancelado", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "cancelled",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);
      // Mock do begin: simula o callback (re-leitura dentro da tx) executando UPDATE
      // de cancelamento. O callback recebe um tx que reusa o sqlMock.
      const tx = vi.fn(async () => [{ status: "pendente" }]);
      Object.assign(tx, { /* template tag function */ });
      sqlMock.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        // Primeiro SELECT FOR UPDATE retorna pendente, depois UPDATE
        const txTag = vi.fn();
        (txTag as unknown as { mockResolvedValueOnce: (v: unknown) => unknown }).mockResolvedValueOnce = (v: unknown) => txTag;
        let call = 0;
        const txFunc = ((..._a: unknown[]) => {
          call++;
          if (call === 1) return Promise.resolve([{ status: "pendente" }]);
          return Promise.resolve([]);
        }) as unknown;
        return cb(txFunc);
      });
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.cancelled_before_confirm).toBe(true);
      expect(mockEstornarVenda).not.toHaveBeenCalled();
    });

    it("charged_back e pagamento confirmado: estorna", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "charged_back",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "confirmado",
          valor: 1000,
          gateway_payload: {},
        }]);
      // Re-leitura dentro de tx confirma "confirmado" → segue pra estornarVenda
      sqlMock.begin = vi.fn(async () => "confirmado");
      mockEstornarVenda.mockResolvedValueOnce({
        ok: true,
        acao: "cancelada",
        outros_confirmados: 0,
        cr_canceladas: 1,
      });
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.estornado).toBe(true);
      expect(data.acao).toBe("cancelada");
    });
  });

  // ── 8. type=merchant_order ─────────────────────────────────────────────────
  describe("type=merchant_order", () => {
    it("order com payment approved: confirma pagamento ERP sem concluir a venda (fluxo novo)", async () => {
      mockFetchMerchantOrder.mockResolvedValueOnce({
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        payments: [
          { id: PAYMENT_ID, status: "approved", transaction_amount: 1000 },
        ],
      });
      // dentro do begin tx
      sqlMock.begin = vi.fn(async () => ({ quitada: true }));
      sqlMock.mockResolvedValueOnce([]); // log inicial

      const res = await POST(makeRequest({ type: "merchant_order" }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.pagamento_quitado).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("order sem payment approved: noop pending", async () => {
      mockFetchMerchantOrder.mockResolvedValueOnce({
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        payments: [
          { id: PAYMENT_ID, status: "pending", transaction_amount: 1000 },
        ],
      });
      const res = await POST(makeRequest({ type: "merchant_order" }));
      const data = await res.json();
      expect(data.pending).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("merchant_order com live_mode=false: simulação", async () => {
      const res = await POST(makeRequest({ type: "merchant_order", liveMode: false }));
      const data = await res.json();
      expect(data.simulation).toBe(true);
      expect(mockFetchMerchantOrder).not.toHaveBeenCalled();
    });

    it("merchant_order sem orderId: erro", async () => {
      // Construir manualmente sem data.id
      const url = new URL("http://localhost/api/webhooks/mercado-pago");
      url.searchParams.set("type", "merchant_order");
      const req = new NextRequest(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "merchant_order" }),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toMatch(/orderId/i);
    });
  });

  // ── 9. external_reference inválido ─────────────────────────────────────────
  describe("external_reference inválido", () => {
    it("external_reference sem padrão venda:X:pag:Y: 200 ignored", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: "formato:errado",
        transaction_amount: 100,
      });
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ignored).toMatch(/inválido/);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });

    it("sem external_reference: 200 ignored", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        transaction_amount: 100,
      });
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(data.ignored).toMatch(/external_reference/);
    });
  });

  // ── 10. Pagamento não encontrado no banco ──────────────────────────────────
  describe("Pagamento não encontrado", () => {
    it("pagamento_id inexistente: 200 ignored", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([]); // SELECT pagamento — vazio
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ignored).toMatch(/não encontrado/);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── 11. Auto-aprovação de venda em rascunho ───────────────────────────────
  describe("Auto-aprovação de venda em rascunho com aprovacao_credito_tipo", () => {
    it("não quitada + crédito aprovado + sem outros pendentes: chama approveVenda", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 500,
      });
      sqlMock
        .mockResolvedValueOnce([]) // log
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 500,
          gateway_payload: {},
        }]);

      sqlMock.begin = vi.fn(async () => ({ quitada: false, pago: 500, total: 1000 }));

      sqlMock
        .mockResolvedValueOnce([{ aprovacao_credito_tipo: "credito_50_50", situacao: "rascunho" }])
        // outros pendentes não-A Receber
        .mockResolvedValueOnce([{ cnt: 0 }])
        // getSystemUserId — configuracoes_sistema
        .mockResolvedValueOnce([{ valor: JSON.stringify(SYSTEM_USER_ID) }]);

      await POST(makeRequest());
      expect(mockApproveVenda).toHaveBeenCalledWith(
        VENDA_ID,
        SYSTEM_USER_ID,
        { tinyBestEffort: true },
      );
    });

    it("não quitada + sem aprovacao_credito_tipo: NÃO chama approveVenda", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 500,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 500,
          gateway_payload: {},
        }]);
      sqlMock.begin = vi.fn(async () => ({ quitada: false, pago: 500, total: 1000 }));
      sqlMock
        .mockResolvedValueOnce([{ aprovacao_credito_tipo: null, situacao: "rascunho" }]);

      await POST(makeRequest());
      expect(mockApproveVenda).not.toHaveBeenCalled();
    });

    it("não quitada + crédito aprovado MAS outros pendentes não-A Receber: NÃO chama approveVenda", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 300,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 300,
          gateway_payload: {},
        }]);
      sqlMock.begin = vi.fn(async () => ({ quitada: false, pago: 300, total: 1000 }));
      sqlMock
        .mockResolvedValueOnce([{ aprovacao_credito_tipo: "credito", situacao: "rascunho" }])
        .mockResolvedValueOnce([{ cnt: 1 }]); // ainda há pendentes

      await POST(makeRequest());
      expect(mockApproveVenda).not.toHaveBeenCalled();
    });
  });

  // ── 12. Pagamento quitado — fluxo novo 06/2026 ─────────────────────────────
  // A auto-conclusão por pagamento foi APOSENTADA: quitação não depende mais
  // de system_user_id nem de concluirVenda. O webhook só registra o pagamento;
  // o status da venda muda apenas na entrega (em_rota → entregue).
  describe("Pagamento quitado não conclui a venda (fluxo novo)", () => {
    it("quitada sem mp_system_user_id configurado: 200 ok mesmo assim", async () => {
      mockFetchPayment.mockResolvedValueOnce({
        id: PAYMENT_ID,
        status: "approved",
        external_reference: `venda:${VENDA_ID}:pag:${PAGAMENTO_ID}`,
        transaction_amount: 1000,
      });
      sqlMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: PAGAMENTO_ID,
          venda_id: VENDA_ID,
          status: "pendente",
          valor: 1000,
          gateway_payload: {},
        }]);

      sqlMock.begin = vi.fn(async () => ({ quitada: true, pago: 1000, total: 1000 }));

      const res = await POST(makeRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.pagamento_quitado).toBe(true);
      expect(mockConcluirVenda).not.toHaveBeenCalled();
    });
  });

  // ── Extras ─────────────────────────────────────────────────────────────────
  describe("Tipos não suportados e simulação", () => {
    it("type desconhecido (chargeback genérico): 200 ignored_type", async () => {
      const res = await POST(makeRequest({ type: "chargeback" }));
      const data = await res.json();
      expect(data.ignored_type).toBe("chargeback");
      expect(mockFetchPayment).not.toHaveBeenCalled();
    });

    it("payment com live_mode=false: simulação OK sem fetch", async () => {
      const res = await POST(makeRequest({ liveMode: false }));
      const data = await res.json();
      expect(data.simulation).toBe(true);
      expect(mockFetchPayment).not.toHaveBeenCalled();
    });

    it("payment sem data.id: 400", async () => {
      const url = new URL("http://localhost/api/webhooks/mercado-pago");
      url.searchParams.set("type", "payment");
      const req = new NextRequest(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "payment" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("fetchPayment lança erro: 200 com erro logado", async () => {
      mockFetchPayment.mockRejectedValueOnce(new Error("MP API down"));
      const res = await POST(makeRequest());
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
      // A resposta ao MP usa mensagem genérica (evita 502→reentrega); o erro
      // real vai pro log em alissonerp.webhook_log.
      expect(data.error).toBe("Erro ao buscar payment");
      const errorLog = sqlMock.mock.calls.find(call => {
        const tpl = call[0];
        if (!Array.isArray(tpl)) return false;
        return tpl.join(" ").includes("INSERT INTO alissonerp.webhook_log") &&
          JSON.stringify(call.slice(1)).includes("MP API down");
      });
      expect(errorLog).toBeDefined();
    });
  });
});
