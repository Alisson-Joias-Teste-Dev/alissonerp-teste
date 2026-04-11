import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { fetchPayment, getWebhookSecret } from "@/lib/mercado-pago";
import { approveVenda, concluirVenda } from "@/lib/vendas-aprovar";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/webhooks/mercado-pago
//
// Receiver de notificações Mercado Pago (Payment Link + Point Smart).
//
// Fluxo:
//   1. Log bruto imediato em webhook_log
//   2. Valida HMAC (header x-signature + x-request-id + query data.id)
//   3. Só processa type=payment
//   4. GET /v1/payments/{id} pra buscar detalhes completos
//   5. Parse external_reference → venda_id + pagamento_id
//   6. Idempotência: se pagamento já confirmado, retorna 200 sem reprocessar
//   7. Se status=approved:
//        - UPDATE pagamentos_venda status=confirmado
//        - Se soma(confirmados) >= total_venda:
//            - approveVenda()  (envia Tiny, noop se já aprovada)
//            - concluirVenda() (marca contas_receber como pago)
//   8. Retorna sempre 200 em cenários tratados (evita MP reentregar)
// ═══════════════════════════════════════════════════════════════════════════

const WEBHOOK_NOME = "mercado-pago-payment";

// User ID sistema — usado em created_by quando a transição vem de automação.
// Lê de configuracoes_sistema.mp_system_user_id; fallback: usa o created_by
// original da venda.
async function getSystemUserId(vendaId: number): Promise<string | null> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'mp_system_user_id'
  `;
  if (row?.valor) {
    let v: string;
    try { v = JSON.parse(row.valor as string); } catch { v = String(row.valor); }
    v = v.replace(/"/g, "").trim();
    if (v) return v;
  }
  // Fallback: created_by da venda
  const [venda] = await sql`SELECT created_by FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  return venda?.created_by ? String(venda.created_by) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validação de assinatura MP
// Formato do header x-signature: "ts=1234567890,v1=hexhash"
// Fórmula: hmac_sha256(secret, "id:{data_id};request-id:{request_id};ts:{ts};")
// Docs: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
// ═══════════════════════════════════════════════════════════════════════════

async function validarAssinatura(
  req: NextRequest,
  dataId: string
): Promise<{ ok: boolean; erro?: string }> {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature || !xRequestId) {
    return { ok: false, erro: "Headers x-signature ou x-request-id ausentes" };
  }

  // Parse "ts=...,v1=..."
  const parts = xSignature.split(",").map(p => p.trim());
  const tsPart = parts.find(p => p.startsWith("ts="));
  const v1Part = parts.find(p => p.startsWith("v1="));
  if (!tsPart || !v1Part) {
    return { ok: false, erro: "x-signature malformado" };
  }

  const ts = tsPart.slice(3);
  const v1 = v1Part.slice(3);

  let secret: string;
  try {
    secret = await getWebhookSecret();
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Secret não configurado" };
  }

  // Manifesto: "id:{data_id};request-id:{x-request-id};ts:{ts};"
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // Comparação timing-safe
  try {
    const a = Buffer.from(v1, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return { ok: false, erro: "Assinatura não bate" };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, erro: "Assinatura não bate" };
  } catch {
    return { ok: false, erro: "Assinatura inválida" };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const url = new URL(req.url);

  // ─── 1. Log bruto imediato (antes de qualquer validação) ─────────────────
  let body: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    live_mode?: boolean;
    user_id?: number | string;
  } = {};
  try { body = JSON.parse(rawBody); } catch { /* keep empty */ }

  await sql`
    INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
    VALUES (
      ${WEBHOOK_NOME},
      ${JSON.stringify({
        headers: {
          "x-signature": req.headers.get("x-signature"),
          "x-request-id": req.headers.get("x-request-id"),
        },
        query: Object.fromEntries(url.searchParams.entries()),
        body,
      })}::jsonb,
      NULL
    )
  `;

  // ─── 2. Extrai data.id (query tem prioridade, body como fallback) ────────
  const dataId =
    url.searchParams.get("data.id") ??
    (body.data?.id != null ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body.type ?? "";

  if (type !== "payment") {
    // merchant_order, chargebacks, etc. — ignora silenciosamente
    return NextResponse.json({ ok: true, ignored_type: type });
  }
  if (!dataId) {
    return NextResponse.json({ ok: false, error: "data.id ausente" }, { status: 400 });
  }

  // ─── 3. Valida assinatura HMAC ───────────────────────────────────────────
  const sig = await validarAssinatura(req, dataId);
  if (!sig.ok) {
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ raw_body: rawBody.slice(0, 500) })}::jsonb, 401, ${sig.erro ?? "HMAC inválido"})
    `;
    return NextResponse.json({ error: sig.erro }, { status: 401 });
  }

  // ─── 3.5. Detecta simulação do painel MP ─────────────────────────────────
  // O botão "Simular notificação" do painel de Webhooks envia:
  //   { live_mode: false, data.id: "123456", ... }
  // O payment_id "123456" é fake e fetchPayment() retornaria 404/401 real.
  // Tratamos explicitamente pra retornar 200 OK limpo no painel MP, provando
  // que o endpoint está recebendo, HMAC validou e parseou o payload.
  if (body.live_mode === false) {
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
        simulation: true,
        data_id: dataId,
        type,
        user_id: body.user_id,
        action: body.action,
        resultado: "simulacao_validada",
      })}::jsonb, 200)
    `;
    return NextResponse.json({
      ok: true,
      simulation: true,
      message: "Webhook MP recebido e HMAC validado. Simulação OK.",
    });
  }

  // ─── 4. Busca pagamento detalhado na MP ──────────────────────────────────
  let payment: Record<string, unknown>;
  try {
    payment = await fetchPayment(dataId) as unknown as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar payment";
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ data_id: dataId })}::jsonb, 502, ${msg})
    `;
    // Retorna 200 pra não fazer MP reentregar (já está logado)
    return NextResponse.json({ ok: false, error: msg });
  }

  const status = String(payment.status ?? "");
  const externalReference = payment.external_reference as string | undefined;
  const transactionAmount = Number(payment.transaction_amount ?? 0);
  const paymentId = String(payment.id ?? dataId);
  const pointOfInteraction = (payment.point_of_interaction as Record<string, unknown> | undefined)?.type;

  if (!externalReference) {
    // Pagamento não vinculado a venda ERP — ignora
    return NextResponse.json({ ok: true, ignored: "sem external_reference" });
  }

  // ─── 5. Parse "venda:X:pag:Y" ────────────────────────────────────────────
  const match = externalReference.match(/^venda:(\d+):pag:(\d+)$/);
  if (!match) {
    return NextResponse.json({ ok: true, ignored: "external_reference inválido" });
  }
  const vendaId = Number(match[1]);
  const pagamentoId = Number(match[2]);

  // ─── 6. Busca pagamento ERP ──────────────────────────────────────────────
  const [pag] = await sql`
    SELECT id, venda_id, status, valor, gateway_payload
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
    FOR UPDATE
  `;
  if (!pag) {
    return NextResponse.json({ ok: true, ignored: "pagamento_id não encontrado" });
  }

  // Idempotência: se já está confirmado e payment_id já foi registrado no payload
  const payloadAntigo = (pag.gateway_payload as Record<string, unknown> | null) ?? {};
  const paymentIdsProcessados = (payloadAntigo.payment_ids_processados as string[] | undefined) ?? [];
  if (pag.status === "confirmado" && paymentIdsProcessados.includes(paymentId)) {
    return NextResponse.json({ ok: true, ja_processado: true });
  }

  // ─── 7. Processa status ──────────────────────────────────────────────────
  const novoPayload = {
    ...payloadAntigo,
    ultimo_payment_id: paymentId,
    ultimo_status: status,
    ultimo_update: new Date().toISOString(),
    point_of_interaction_type: pointOfInteraction ?? null,
    payment_ids_processados: [...new Set([...paymentIdsProcessados, paymentId])],
  };

  if (status === "approved") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: typeof sql) => {
      // 7a. Marca pagamento como confirmado
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET
          status           = 'confirmado',
          data_confirmacao = NOW(),
          gateway_id       = ${paymentId},
          gateway_payload  = ${JSON.stringify(novoPayload)}::jsonb
        WHERE id = ${pagamentoId}
      `;

      // 7b. Verifica se total pago cobre a venda
      const [{ soma_confirmados, total_venda }] = await tx`
        SELECT
          COALESCE((SELECT SUM(valor) FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} AND status = 'confirmado'), 0)::numeric AS soma_confirmados,
          (SELECT total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId})::numeric AS total_venda
      `;

      const pago = Number(soma_confirmados);
      const total = Number(total_venda);
      const quitada = pago + 0.01 >= total; // tolerância de 1 centavo

      return { quitada, pago, total };
    });

    if (result.quitada) {
      // 7c. Aprovar + concluir venda (fora da tx porque approveVenda tem seus próprios COMMITs)
      const systemUserId = await getSystemUserId(vendaId);
      if (!systemUserId) {
        await sql`
          INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
          VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId })}::jsonb, 500, 'system_user_id não configurado')
        `;
        return NextResponse.json({ ok: false, error: "system_user_id não configurado" });
      }

      let resultadoConclusao;
      try {
        // tinyBestEffort=true: se Tiny estiver fora (token expirado, etc),
        // a venda AINDA é concluída. O webhook de pagamento MP nunca pode
        // ficar refém do estado da integração Tiny — cliente já pagou.
        resultadoConclusao = await concluirVenda(vendaId, systemUserId, {
          tinyBestEffort: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao concluir venda";
        await sql`
          INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
          VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId, payment_id: paymentId })}::jsonb, 500, ${msg})
        `;
        // Retorna 200 mesmo assim — pagamento já está registrado como confirmado
        return NextResponse.json({
          ok: false,
          pagamento_confirmado: true,
          venda_concluida: false,
          error: msg,
        });
      }

      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
        VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
          venda_id: vendaId,
          pagamento_id: pagamentoId,
          payment_id: paymentId,
          resultado: "venda_concluida",
          pago: result.pago,
          total: result.total,
          ...(resultadoConclusao.tiny_erro ? { tiny_erro: resultadoConclusao.tiny_erro } : {}),
          cr_quitadas: resultadoConclusao.cr_quitadas,
        })}::jsonb, 200, ${resultadoConclusao.tiny_erro ?? null})
      `;

      return NextResponse.json({
        ok: true,
        venda_id: vendaId,
        pagamento_id: pagamentoId,
        venda_concluida: true,
        ...(resultadoConclusao.tiny_erro ? { tiny_sync_pendente: true } : {}),
      });
    } else {
      // Pagamento parcial — só confirma esse pagamento, não fecha venda
      return NextResponse.json({
        ok: true,
        venda_id: vendaId,
        pagamento_id: pagamentoId,
        venda_concluida: false,
        pago: result.pago,
        total: result.total,
      });
    }
  } else if (status === "pending" || status === "in_process" || status === "in_mediation") {
    // Apenas atualiza payload, mantém status=pendente
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify(novoPayload)}::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ ok: true, pending: true, status });
  } else if (status === "rejected" || status === "cancelled" || status === "refunded" || status === "charged_back") {
    // Pagamento falhou: atualiza payload. NÃO cancela venda — vendedora decide.
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify(novoPayload)}::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ ok: true, failed: true, status });
  }

  // Status desconhecido — log e 200
  await sql`
    INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
    VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId, payment_id: paymentId, status })}::jsonb, 200, 'status desconhecido')
  `;
  return NextResponse.json({ ok: true, unknown_status: status });
}

// GET pra MP testar conectividade (retorna 200 simples)
export async function GET() {
  return NextResponse.json({ ok: true, service: "mercado-pago-webhook" });
}
