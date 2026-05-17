import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { fetchPayment, fetchMerchantOrder, getWebhookSecret } from "@/lib/mercado-pago";
import { concluirVenda, estornarVenda } from "@/lib/vendas-aprovar";

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
// Cadeia (sem fallback admin aleatório, que corrompia audit trail):
//  1. configuracoes_sistema.mp_system_user_id (preferido — admin dedicado pra automação)
//  2. created_by da venda (autor original; é honesto: foi quem criou que iniciou o fluxo)
//  3. null + log ERROR se nem isso existir → venda NÃO é concluída automaticamente
//
// Removido em v2.46.0 (Onda 1A-3): o fallback "admin mais antigo ativo" mentia
// no audit trail. Em vez de fingir, falhamos loud — operador vê na fila e
// conclui manualmente quando configurar mp_system_user_id.
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
  // Fallback único e honesto: created_by da venda (foi quem iniciou)
  const [venda] = await sql`SELECT created_by FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (venda?.created_by) return String(venda.created_by);

  console.error(`[webhook-mp] getSystemUserId venda=${vendaId} retornou NULL — sem mp_system_user_id em configuracoes_sistema e sem created_by na venda. Pagamento sera confirmado MAS venda NAO sera concluida automaticamente. Configure mp_system_user_id ou conclua manualmente.`);
  return null;
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

// ═══════════════════════════════════════════════════════════════════════════
// Processa merchant_order (In-Store QR PIX)
// Busca a ordem no MP, verifica se algum pagamento está approved,
// e confirma o pagamento ERP correspondente via external_reference.
// ═══════════════════════════════════════════════════════════════════════════
async function handleMerchantOrder(orderId: string | null, liveMode?: boolean): Promise<NextResponse> {
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId ausente" });

  if (liveMode === false) {
    return NextResponse.json({ ok: true, simulation: true, message: "merchant_order simulado OK" });
  }

  let order: Record<string, unknown>;
  try {
    order = await fetchMerchantOrder(orderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar merchant_order";
    return NextResponse.json({ ok: false, error: msg });
  }

  const externalReference = order.external_reference as string | undefined;
  if (!externalReference) return NextResponse.json({ ok: true, ignored: "sem external_reference" });

  const match = externalReference.match(/^venda:(\d+):pag:(\d+)$/);
  if (!match) return NextResponse.json({ ok: true, ignored: "external_reference inválido" });

  const vendaId = Number(match[1]);
  const pagamentoId = Number(match[2]);

  // Verifica se há algum pagamento aprovado na ordem
  const payments = (order.payments as Array<{ id?: number | string; status?: string; transaction_amount?: number }> | undefined) ?? [];
  const aprovado = payments.find(p => p.status === "approved");
  if (!aprovado) {
    // Ordem existe mas pagamento ainda não aprovado — noop
    return NextResponse.json({ ok: true, pending: true });
  }

  const transactionAmount = Number(aprovado.transaction_amount ?? 0);
  const paymentId = String(aprovado.id ?? "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (sql as any).begin(async (tx: typeof sql) => {
    // C2: SELECT FOR UPDATE dentro da tx previne race conditions com webhooks concorrentes
    const [pagTx] = await tx`
      SELECT id, venda_id, status FROM alissonerp.pagamentos_venda
      WHERE id = ${pagamentoId} AND venda_id = ${vendaId} FOR UPDATE
    `;
    if (!pagTx) return { ignored: true };
    if (pagTx.status === "confirmado") return { ja_processado: true };

    // Guard: outros meios confirmados já cobrem o total? Não confirmar duas vezes.
    const [totaisOthers] = await tx`
      SELECT
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.id != ${pagamentoId}), 0)::numeric AS soma_outros,
        v.total_venda::numeric AS total_venda_local
      FROM alissonerp.vendas_erp v
      LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
      WHERE v.id = ${vendaId}
      GROUP BY v.total_venda
    `;
    if (totaisOthers && Number(totaisOthers.soma_outros) + 0.01 >= Number(totaisOthers.total_venda_local)) {
      return { quitada: true, ja_coberto: true };
    }

    // payment_ids_processados garante idempotência se o mesmo pagamento
    // chegar depois via webhook tipo 'payment' (cenário comum: MP envia
    // ambos). Antes este UPDATE não populava o array → re-execução.
    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET status = 'confirmado', source = 'webhook_mp', data_confirmacao = NOW(), gateway_id = ${paymentId},
          valor_liquido = ${transactionAmount}, taxas_mp = 0,
          gateway_payload = gateway_payload || ${JSON.stringify({
            merchant_order_id: orderId,
            ultimo_payment_id: paymentId,
            ultimo_status: "approved",
            ultimo_update: new Date().toISOString(),
            payment_ids_processados: [paymentId],
          })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    const [{ soma_confirmados, total_venda }] = await tx`
      SELECT
        COALESCE((SELECT SUM(valor) FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} AND status = 'confirmado'), 0)::numeric AS soma_confirmados,
        (SELECT total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId})::numeric AS total_venda
    `;
    return { quitada: Number(soma_confirmados) + 0.01 >= Number(total_venda) };
  });

  if (result?.ignored) return NextResponse.json({ ok: true, ignored: "pagamento não encontrado" });
  if (result?.ja_processado) return NextResponse.json({ ok: true, ja_processado: true });

  if (result.quitada) {
    const systemUserId = await getSystemUserId(vendaId);
    if (systemUserId) {
      try {
        await concluirVenda(vendaId, systemUserId, { tinyBestEffort: true });
      } catch (err) {
        console.error("[webhook-mp merchant_order] Erro ao concluir venda:", err);
      }
    }
  }

  await sql`
    INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
    VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
      tipo: "merchant_order",
      order_id: orderId,
      venda_id: vendaId,
      pagamento_id: pagamentoId,
      payment_id: paymentId,
      resultado: result.quitada ? "venda_concluida" : "pagamento_confirmado",
    })}::text::jsonb, 200)
  `;

  return NextResponse.json({ ok: true, venda_id: vendaId, pagamento_id: pagamentoId, venda_concluida: result.quitada });
}

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
      })}::text::jsonb,
      NULL
    )
  `;

  // ─── 2. Extrai data.id (query tem prioridade, body como fallback) ────────
  const dataId =
    url.searchParams.get("data.id") ??
    (body.data?.id != null ? String(body.data.id) : null);
  const type = url.searchParams.get("type") ?? body.type ?? "";

  if (type === "merchant_order") {
    // In-Store QR PIX envia merchant_order em vez de payment
    return handleMerchantOrder(dataId, body.live_mode);
  }

  if (type !== "payment") {
    // chargebacks, etc. — ignora silenciosamente
    return NextResponse.json({ ok: true, ignored_type: type });
  }
  if (!dataId) {
    return NextResponse.json({ ok: false, error: "data.id ausente" }, { status: 400 });
  }

  // ─── 3. Valida assinatura HMAC (OBRIGATÓRIO se secret configurado) ──────
  // Antes era best-effort com fallback ao access_token — mas o shortcut
  // live_mode=false permitia bypass total. Agora: se mp_webhook_secret existe
  // em configuracoes_secrets, HMAC É OBRIGATÓRIO em TODA chamada (incluindo
  // simulação do painel MP, que envia HMAC válido também).
  const sig = await validarAssinatura(req, dataId);
  if (!sig.ok) {
    const errorMsg = sig.erro ?? "Assinatura HMAC inválida";
    // Se o erro é "secret não configurado", mantém comportamento legado (warn)
    // para não quebrar setups que ainda não rodaram a configuração inicial.
    const secretMissing = errorMsg.toLowerCase().includes("secret");
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ data_id: dataId, hmac_check: "failed" })}::text::jsonb, ${secretMissing ? 200 : 401}, ${errorMsg})
    `;
    if (secretMissing) {
      console.warn("[webhook-mp] mp_webhook_secret nao configurado — aceitando webhook sem validacao HMAC. Configure em Configuracoes > Integracoes.");
    } else {
      return NextResponse.json({ error: "Assinatura invalida" }, { status: 401 });
    }
  }

  // ─── 3.5. Detecta simulação do painel MP ─────────────────────────────────
  // O botão "Simular notificação" do painel de Webhooks envia live_mode=false
  // mas COM HMAC válido. Como o HMAC já foi validado acima, podemos retornar
  // 200 limpo (não chamamos fetchPayment porque o data.id é fake).
  // Sem HMAC válido + live_mode=false NUNCA chega aqui (bloqueado em 3.).
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
      })}::text::jsonb, 200)
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
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ data_id: dataId })}::text::jsonb, 502, ${msg})
    `;
    // Retorna 200 pra não fazer MP reentregar (já está logado)
    return NextResponse.json({ ok: false, error: msg });
  }

  const status = String(payment.status ?? "");
  const externalReference = payment.external_reference as string | undefined;
  const transactionAmount = Number(payment.transaction_amount ?? 0);
  const paymentId = String(payment.id ?? dataId);
  const pointOfInteraction = (payment.point_of_interaction as Record<string, unknown> | undefined)?.type;

  // ─── Valor líquido + taxas MP ────────────────────────────────────────────
  // transaction_details.net_received_amount = o que realmente cai na conta MP
  // (source of truth — inclui TODAS as taxas: MP fee, adquirência, etc).
  //
  // fee_details[] mostra só a parte do MP fee explícito. Pro valor real de
  // "taxas cobradas" calculamos transaction_amount - net_received_amount,
  // que captura tudo que foi deduzido.
  const txDetails = payment.transaction_details as
    | { net_received_amount?: number | string; total_paid_amount?: number | string }
    | undefined;
  const netReceivedAmount = txDetails?.net_received_amount != null
    ? Number(txDetails.net_received_amount)
    : null;
  const feeDetailsRaw = (payment.fee_details as Array<{ amount?: number | string }> | undefined) ?? [];
  const valorLiquido = netReceivedAmount != null ? netReceivedAmount : transactionAmount;
  // taxas = o que foi retido (bruto - líquido), mais preciso que somar fee_details
  const taxasMP = Math.max(0, Number((transactionAmount - valorLiquido).toFixed(2)));

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
  // FOR UPDATE é ineficaz fora de transação — o lock real é feito dentro de cada sql.begin()
  const [pag] = await sql`
    SELECT id, venda_id, status, valor, gateway_payload
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
  `;
  if (!pag) {
    return NextResponse.json({ ok: true, ignored: "pagamento_id não encontrado" });
  }

  // Idempotência: pre-check rápido (não-transacional); verificação atômica ocorre dentro da tx
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
    payment_method_id: payment.payment_method_id ?? null,
    payment_type_id: payment.payment_type_id ?? null,
    transaction_amount: transactionAmount,
    net_received_amount: netReceivedAmount,
    taxas_mp_total: taxasMP,
    fee_details: feeDetailsRaw,
    money_release_date: payment.money_release_date ?? null,
    payment_ids_processados: [...new Set([...paymentIdsProcessados, paymentId])],
  };

  if (status === "approved") {
    // Defesa: se MP retornar approved sem transaction_amount (raro mas
    // documentado em alguns bursts da API), grava 0 em valor_liquido/taxas_mp
    // mascarando os dados reais. Loga e ignora — webhook entrega de novo.
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
        VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
          venda_id: vendaId,
          pagamento_id: pagamentoId,
          payment_id: paymentId,
          status,
          transaction_amount: payment.transaction_amount,
          motivo: "transaction_amount inválido — webhook ignorado",
        })}::text::jsonb, 200, 'transaction_amount inválido')
      `;
      return NextResponse.json({ ok: false, ignored: "transaction_amount inválido" });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: typeof sql) => {
      // C2: SELECT FOR UPDATE dentro da tx — garante atomicidade contra webhooks concorrentes
      const [pagTx] = await tx`
        SELECT id, status, gateway_payload
        FROM alissonerp.pagamentos_venda
        WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
        FOR UPDATE
      `;
      if (!pagTx) return { ignored: true };
      // Re-verifica idempotência com lock garantido (pre-check externo pode ter passado em race)
      const payloadTx = (pagTx.gateway_payload as Record<string, unknown> | null) ?? {};
      const idsTx = (payloadTx.payment_ids_processados as string[] | undefined) ?? [];
      if (pagTx.status === "confirmado" && idsTx.includes(paymentId)) {
        return { ja_processado: true };
      }

      // Guard: outros meios confirmados já cobrem o total? Não confirmar duas vezes.
      const [totaisOthers] = await tx`
        SELECT
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.id != ${pagamentoId}), 0)::numeric AS soma_outros,
          v.total_venda::numeric AS total_venda_local
        FROM alissonerp.vendas_erp v
        LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
        WHERE v.id = ${vendaId}
        GROUP BY v.total_venda
      `;
      if (totaisOthers && Number(totaisOthers.soma_outros) + 0.01 >= Number(totaisOthers.total_venda_local)) {
        return { quitada: true, ja_coberto: true, pago: Number(totaisOthers.soma_outros), total: Number(totaisOthers.total_venda_local) };
      }

      // 7a. Marca pagamento como confirmado + grava valor líquido e taxas
      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET
          status           = 'confirmado',
          source           = 'webhook_mp',
          data_confirmacao = NOW(),
          gateway_id       = ${paymentId},
          valor_liquido    = ${valorLiquido},
          taxas_mp         = ${taxasMP},
          gateway_payload  = ${JSON.stringify(novoPayload)}::text::jsonb
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

    if (result?.ignored) return NextResponse.json({ ok: true, ignored: "pagamento_id não encontrado" });
    if (result?.ja_processado) return NextResponse.json({ ok: true, ja_processado: true });

    // 7c-pre. Se não quitada mas crédito aprovado + todos os não-A Receber confirmados → aprovar venda
    if (!result.quitada) {
      try {
        const [vendaCredito] = await sql`
          SELECT aprovacao_credito_tipo, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
        `;
        if (vendaCredito?.aprovacao_credito_tipo && vendaCredito.situacao === "rascunho") {
          // Verificar se todos os pagamentos não-A Receber estão confirmados
          const [outrosPend] = await sql`
            SELECT COUNT(*) AS cnt FROM alissonerp.pagamentos_venda
            WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
          `;
          if (Number(outrosPend.cnt) === 0) {
            const { approveVenda } = await import("@/lib/vendas-aprovar");
            const sysUser = await getSystemUserId(vendaId);
            console.log(`[webhook-mp] auto-aprovando venda=${vendaId} tipo=${vendaCredito.aprovacao_credito_tipo} sysUser=${sysUser}`);
            if (sysUser) {
              await approveVenda(vendaId, sysUser, { tinyBestEffort: true });
              console.log(`[webhook-mp] venda=${vendaId} aprovada automaticamente via pagamento parcial`);
            }
          }
        }
      } catch (err) {
        console.error(`[webhook-mp] Erro ao auto-aprovar venda ${vendaId} após pagamento:`, err);
      }
    }

    if (result.quitada) {
      // 7c. Aprovar + concluir venda (fora da tx porque approveVenda tem seus próprios COMMITs)
      const systemUserId = await getSystemUserId(vendaId);
      if (!systemUserId) {
        await sql`
          INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
          VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId })}::text::jsonb, 500, 'system_user_id não configurado')
        `;
        return NextResponse.json({ ok: false, error: "system_user_id não configurado" });
      }

      let resultadoConclusao;
      console.log(`[webhook-mp] pagamento quitado venda=${vendaId} pago=${result.pago} total=${result.total} — concluindo`);
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
          VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId, payment_id: paymentId })}::text::jsonb, 500, ${msg})
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
        })}::text::jsonb, 200, ${resultadoConclusao.tiny_erro ?? null})
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
      SET gateway_payload = ${JSON.stringify(novoPayload)}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ ok: true, pending: true, status });
  } else if (status === "rejected") {
    // Rejected = tentativa de pagamento negada (cartão recusado, etc).
    // Nunca foi confirmado — só atualiza payload, mantém pagamento pendente.
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify(novoPayload)}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ ok: true, rejected: true, status });
  } else if (status === "refunded" || status === "cancelled" || status === "charged_back") {
    // ESTORNO / CANCELAMENTO / CHARGEBACK
    //
    // Se o pagamento já estava 'confirmado' antes, é um estorno REAL que
    // afeta uma venda fechada. Chama estornarVenda que:
    //   - pagamentos_venda.status → 'estornado'
    //   - Se havia outros pagamentos confirmados: venda → 'rascunho'
    //   - Se era o único: venda → 'cancelado' (trigger 111 reverte estoque)
    //   - contas_receber → 'cancelado'
    //
    // Se o pagamento NÃO estava confirmado (pending que foi cancelado),
    // só atualiza o payload (comportamento igual ao 'rejected').
    //
    // RACE CONDITION FIX: a leitura de pag.status (linha 358) é fora de tx.
    // Em caso de webhook approved + refunded chegando concorrentes, o approved
    // pode commitar status='confirmado' DEPOIS dessa leitura mas ANTES da
    // decisão aqui — fazendo o refund pular estornarVenda e marcar 'cancelado'
    // sem reverter contas_receber. Releia status DENTRO de tx com FOR UPDATE.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reReadStatus = await (sql as any).begin(async (tx: typeof sql) => {
      const [pagTx] = await tx`
        SELECT status FROM alissonerp.pagamentos_venda
        WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
        FOR UPDATE
      `;
      if (!pagTx) return null;
      // Se ainda não está confirmado, marca como cancelado dentro da tx
      if (pagTx.status !== "confirmado") {
        await tx`
          UPDATE alissonerp.pagamentos_venda
          SET status = 'cancelado',
              gateway_payload = ${JSON.stringify(novoPayload)}::text::jsonb
          WHERE id = ${pagamentoId}
        `;
        return "cancelled_before_confirm";
      }
      return "confirmado";
    });

    if (reReadStatus === null) {
      return NextResponse.json({ ok: true, ignored: "pagamento_id não encontrado" });
    }
    if (reReadStatus === "cancelled_before_confirm") {
      return NextResponse.json({ ok: true, cancelled_before_confirm: true, status });
    }

    // Pagamento estava confirmado → estorno de verdade
    let estornoResult;
    try {
      estornoResult = await estornarVenda(vendaId, pagamentoId, {
        ...novoPayload,
        status_mp: status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao estornar venda";
      await sql`
        INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
        VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
          venda_id: vendaId,
          pagamento_id: pagamentoId,
          payment_id: paymentId,
          status,
        })}::text::jsonb, 500, ${msg})
      `;
      // Retorna 200 pra não fazer MP reentregar infinitamente
      return NextResponse.json({ ok: false, estorno_failed: true, error: msg });
    }

    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
      VALUES (${WEBHOOK_NOME}, ${JSON.stringify({
        venda_id: vendaId,
        pagamento_id: pagamentoId,
        payment_id: paymentId,
        status,
        resultado: "estornado",
        acao: estornoResult.acao,
        outros_confirmados: estornoResult.outros_confirmados,
        cr_canceladas: estornoResult.cr_canceladas,
      })}::text::jsonb, 200)
    `;

    return NextResponse.json({
      ok: true,
      venda_id: vendaId,
      pagamento_id: pagamentoId,
      estornado: true,
      acao: estornoResult.acao,
      status,
    });
  }

  // Status desconhecido — log e 200
  await sql`
    INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
    VALUES (${WEBHOOK_NOME}, ${JSON.stringify({ venda_id: vendaId, payment_id: paymentId, status })}::text::jsonb, 200, 'status desconhecido')
  `;
  return NextResponse.json({ ok: true, unknown_status: status });
}

// GET pra MP testar conectividade (retorna 200 simples)
export async function GET() {
  return NextResponse.json({ ok: true, service: "mercado-pago-webhook" });
}
