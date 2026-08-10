/**
 * POST /api/webhooks/pagbank
 *
 * Receiver de notificações PagBank (Orders + Charges).
 *
 * PagBank envia o payload completo do pedido/cobrança como JSON.
 * Não é necessário fazer uma segunda chamada à API para obter status.
 *
 * Fluxo:
 *   1. Log bruto imediato em webhook_log
 *   2. Valida autenticidade via SHA256(token-payload) ↔ header x-authenticity-token
 *   3. Processa charges[] do pedido para encontrar pagamentos PAID
 *   4. Parse reference_id → venda_id + pagamento_id
 *   5. Idempotência: se pagamento já confirmado, retorna 200 sem reprocessar
 *   6. Se status=PAID:
 *      - confirmarPagamentoVenda() com source='webhook_pagbank'
 *      - devolverSaldoGerente()
 *      - baixarContaReceber()
 *      - autoAprovarVendaRascunho()
 *      (fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
 *       o status só muda na entrega)
 *   7. Retorna sempre 200 em cenários tratados (evita PagBank reentregar)
 *
 * DIFERENÇA vs MP: PagBank manda o payload COMPLETO (não apenas notification).
 * A validação é SHA256(token-payload) em vez de HMAC-SHA256 com formato específico.
 * Header de autenticidade: x-authenticity-token (não x-signature).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { validarAssinaturaPagBank, centavosParaReais } from "@/lib/pagbank";
import {
  confirmarPagamentoVenda,
  devolverSaldoGerente,
  baixarContaReceber,
  registrarComunicacaoRecebimento,
  autoAprovarVendaRascunho,
  buscarPagamentoAReceberPendente,
} from "@/lib/baixa-credito";

const WEBHOOK_NOME = "pagbank-payment";

/**
 * Resolve o user ID do sistema para transições automáticas.
 * Cadeia: configuracoes_unificado.pb_system_user_id → created_by da venda → null.
 */
async function getSystemUserId(vendaId: number): Promise<string | null> {
  const [row] = await sql`
    SELECT valor FROM alissonerp.configuracoes_unificado WHERE chave = 'pb_system_user_id'
  `;
  if (row?.valor) {
    let v: string;
    try { v = JSON.parse(row.valor as string); } catch { v = String(row.valor); }
    v = v.replace(/"/g, "").trim();
    if (v) return v;
  }
  // Fallback: created_by da venda
  const [venda] = await sql`SELECT created_by FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (venda?.created_by) return String(venda.created_by);

  console.error(
    `[webhook-pagbank] getSystemUserId venda=${vendaId} retornou NULL — ` +
    `sem pb_system_user_id e sem created_by. Pagamento será confirmado MAS venda NÃO concluída automaticamente.`,
  );
  return null;
}

// ─── Validação de autenticidade PagBank ──────────────────────────────────────
// PagBank usa SHA256(token-payload) no header x-authenticity-token.
// O payload NÃO deve ser formatado — usar o body bruto.
// Docs: https://dev.pagbank.uol.com.br/reference/confirmar-autenticidade-da-notificacao

async function validarAutenticidade(
  req: NextRequest,
  rawBody: string,
): Promise<{ ok: boolean; erro?: string }> {
  const authenticityToken = req.headers.get("x-authenticity-token");

  if (!authenticityToken) {
    return { ok: false, erro: "Header x-authenticity-token ausente" };
  }

  const valido = await validarAssinaturaPagBank(rawBody, authenticityToken);

  if (!valido) {
    return { ok: false, erro: "Assinatura PagBank inválida" };
  }

  return { ok: true };
}

// ─── POST /api/webhooks/pagbank ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Lê o body bruto (string) para validação de assinatura
  const rawBody = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Log do erro antes de retornar
    await logWebhook(req, rawBody, null, 400, "JSON inválido");
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  // Log imediato
  await logWebhook(req, rawBody, payload, null, null);

  // Identificadores do pedido
  const orderId = String(payload.id ?? "");
  const charges = (payload.charges as Array<Record<string, unknown>>) ?? [];

  if (!orderId) {
    await logWebhookUpdate(orderId, 400, "Pedido sem ID");
    return NextResponse.json({ error: "Payload sem id" }, { status: 400 });
  }

  // QR Pix pode chegar com charges vazio até o pagamento efetivar —
  // não rejeitar, apenas processar o que existir.
  if (charges.length === 0) {
    console.log(`[webhook-pagbank] Order ${orderId} sem charges — ignorado (aguardando pagamento)`);
    await logWebhookUpdate(orderId, 200, "Sem charges para processar");
    return NextResponse.json({ ok: true, mensagem: "Sem charges — aguardando pagamento" });
  }

  // Valida autenticidade
  const auth = await validarAutenticidade(req, rawBody);
  if (!auth.ok) {
    await logWebhookUpdate(orderId, 401, auth.erro ?? null);
    console.error(`[webhook-pagbank] Falha autenticidade: ${auth.erro}`);
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Processa cada charge do pedido
  const resultados: Array<Record<string, unknown>> = [];

  for (const charge of charges) {
    const chargeId = String(charge.id ?? "");
    const chargeStatus = String(charge.status ?? "").toUpperCase();
    const referenceId = String(payload.reference_id ?? charge.reference_id ?? "");

    // Parse reference_id: "venda:X:pag:Y"
    const match = referenceId.match(/^venda:(\d+):pag:(\d+)$/);
    if (!match) {
      console.log(`[webhook-pagbank] reference_id não parseável: ${referenceId}`);
      resultados.push({ charge_id: chargeId, status: "ignored", motivo: "reference_id_invalido" });
      continue;
    }

    const vendaId = Number(match[1]);
    const pagamentoId = Number(match[2]);

    if (isNaN(vendaId) || isNaN(pagamentoId)) {
      resultados.push({ charge_id: chargeId, status: "ignored", motivo: "ids_invalidos" });
      continue;
    }

    try {
      // Idempotência: verifica se já processado
      const [pagExistente] = await sql`
        SELECT id, status, gateway_payload
        FROM alissonerp.pagamentos_venda
        WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
      `;

      if (!pagExistente) {
        console.log(`[webhook-pagbank] Pagamento ${pagamentoId} não encontrado na venda ${vendaId}`);
        resultados.push({ charge_id: chargeId, pagamento_id: pagamentoId, status: "not_found" });
        continue;
      }

      // Verifica ids_processados no gateway_payload
      let idsProcessados: string[] = [];
      if (pagExistente.gateway_payload && typeof pagExistente.gateway_payload === "object") {
        const gp = pagExistente.gateway_payload as Record<string, unknown>;
        idsProcessados = Array.isArray(gp.ids_processados)
          ? (gp.ids_processados as string[])
          : [];
      }

      if (pagExistente.status === "confirmado" && idsProcessados.includes(chargeId)) {
        console.log(`[webhook-pagbank] Charge ${chargeId} já processada (idempotência)`);
        resultados.push({ charge_id: chargeId, pagamento_id: pagamentoId, status: "ja_processado" });
        continue;
      }

      // Só processa status PAID
      if (chargeStatus !== "PAID") {
        console.log(`[webhook-pagbank] Charge ${chargeId} status=${chargeStatus} — ignorado`);
        // Atualiza gateway_payload com o status atual
        await atualizarGatewayPayload(sql, pagamentoId, {
          charge_id: chargeId,
          charge_status: chargeStatus,
          atualizado_em: new Date().toISOString(),
          ids_processados: idsProcessados,
        });
        resultados.push({ charge_id: chargeId, pagamento_id: pagamentoId, status: "status_nao_paid" });
        continue;
      }

      // ── Processar pagamento PAID ─────────────────────────────────────────

      const amountValue = (charge.amount as Record<string, unknown>)?.value as number ?? 0;
      const amountSummary = (charge.amount as Record<string, unknown>)?.summary as Record<string, unknown>;
      const valorTotalCentavos = amountSummary?.total as number ?? amountValue;
      const valorPagoCentavos = amountSummary?.paid as number ?? amountValue;
      const valorLiquidoCentavos = valorPagoCentavos; // PagBank não retorna net_amount na charge
      const taxasCentavos = valorTotalCentavos - valorPagoCentavos;

      const valorTotalReais = centavosParaReais(valorTotalCentavos);
      const valorPagoReais = centavosParaReais(valorPagoCentavos);
      const valorLiquidoReais = centavosParaReais(valorLiquidoCentavos);
      const taxasReais = centavosParaReais(Math.max(0, taxasCentavos));

      const userId = await getSystemUserId(vendaId);

      // Confirma o pagamento_venda
      await confirmarPagamentoVenda(sql, pagamentoId, {
        valorEfetivo: valorPagoReais,
        gateway: "PagBank",
        gatewayId: orderId,
        source: "webhook_pagbank",
        valorLiquido: valorLiquidoReais,
        taxasGateway: taxasReais,
      });

      // Atualiza idempotência no gateway_payload
      const novosIds = [...idsProcessados, chargeId];
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway_payload = COALESCE(gateway_payload, '{}'::jsonb)
            || ${JSON.stringify({
              ids_processados: novosIds,
              ultimo_webhook: {
                charge_id: chargeId,
                status: chargeStatus,
                valor: valorTotalReais,
                processado_em: new Date().toISOString(),
              },
            })}::jsonb
        WHERE id = ${pagamentoId}
      `;

      // Devolve saldo ao gerente se aplicável
      if (userId) {
        await devolverSaldoGerente(sql, vendaId, valorPagoReais, pagamentoId, userId);
      }

      // Baixa contas_receber
      const pagPendente = await buscarPagamentoAReceberPendente(sql, vendaId);
      if (pagPendente) {
        const ehParcial = Math.abs(valorPagoReais - pagPendente.valor) > 0.10;
        const valorEfetivo = ehParcial ? Math.min(valorPagoReais, pagPendente.valor) : pagPendente.valor;
        const valorRestante = ehParcial ? pagPendente.valor - valorEfetivo : 0;

        await baixarContaReceber(sql, vendaId, {
          valorPago: valorEfetivo,
          valorRestante,
          userId: userId ?? "system",
          formaRecebimento: "PagBank",
        });

        // Registra comunicação
        try {
          const contas = await sql<{ id: number; descricao: string }[]>`
            SELECT id, descricao FROM alissonerp.contas_receber
            WHERE venda_erp_id = ${vendaId} AND status = 'pago'
            ORDER BY updated_at DESC LIMIT 1
          `;
          for (const c of contas) {
            await registrarComunicacaoRecebimento(sql, c.id, {
              mensagem: `Recebido via PagBank (webhook) — ID ${orderId} | Charge ${chargeId} | R$ ${valorPagoReais.toFixed(2)}`,
              userId: userId ?? "system",
            });
          }
        } catch (err) {
          console.error("[webhook-pagbank] Erro ao registrar comunicação:", err);
        }
      }

      // Auto-aprovar venda em rascunho com crédito. Fluxo novo 06/2026:
      // pagamento quitado NÃO conclui mais a venda — ela segue 'aprovado'
      // até a entrega (em_rota → entregue).
      if (userId) {
        await autoAprovarVendaRascunho(sql, vendaId, userId);
      }

      await logWebhookUpdate(orderId, 200, `PAID processado: charge=${chargeId} venda=${vendaId}`);
      resultados.push({
        charge_id: chargeId,
        pagamento_id: pagamentoId,
        status: "confirmado",
        valor_reais: valorPagoReais,
      });
      console.log(
        `[webhook-pagbank] Pagamento confirmado: venda=${vendaId} pag=${pagamentoId} ` +
        `order=${orderId} charge=${chargeId} valor=R$${valorPagoReais.toFixed(2)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[webhook-pagbank] Erro ao processar charge ${chargeId}:`, err);
      await logWebhookUpdate(orderId, 500, msg);
      resultados.push({ charge_id: chargeId, status: "erro", mensagem: msg });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}

// ─── GET /api/webhooks/pagbank — Healthcheck ─────────────────────────────────

export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: WEBHOOK_NOME,
    status: "ativo",
    mensagem: "Webhook PagBank operacional",
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logWebhook(
  req: NextRequest,
  rawBody: string,
  payload: Record<string, unknown> | null,
  responseStatus: number | null,
  erro: string | null,
) {
  try {
    await sql`
      INSERT INTO alissonerp.webhook_log
        (webhook_nome, payload_bruto, payload_parseado, headers, response_status, erro)
      VALUES (
        ${WEBHOOK_NOME},
        ${rawBody.slice(0, 10000)},
        ${payload ? JSON.stringify(payload).slice(0, 10000) : null}::jsonb,
        ${JSON.stringify(Object.fromEntries(req.headers.entries()))}::jsonb,
        ${responseStatus},
        ${erro}
      )
    `;
  } catch (e) {
    console.error("[webhook-pagbank] Erro ao logar:", e);
  }
}

async function logWebhookUpdate(
  orderId: string,
  responseStatus: number | null,
  erro: string | null,
) {
  try {
    // Atualiza o log mais recente deste webhook
    await sql`
      UPDATE alissonerp.webhook_log
      SET response_status = COALESCE(${responseStatus}, response_status),
          erro = COALESCE(${erro}, erro),
          updated_at = NOW()
      WHERE webhook_nome = ${WEBHOOK_NOME}
        AND id = (
          SELECT id FROM alissonerp.webhook_log
          WHERE webhook_nome = ${WEBHOOK_NOME}
          ORDER BY created_at DESC LIMIT 1
        )
    `;
  } catch (e) {
    console.error("[webhook-pagbank] Erro ao atualizar log:", e);
  }
}

async function atualizarGatewayPayload(
  db: typeof sql,
  pagamentoId: number,
  data: Record<string, unknown>,
) {
  try {
    await db`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = COALESCE(gateway_payload, '{}'::jsonb)
          || ${JSON.stringify(data)}::jsonb
      WHERE id = ${pagamentoId}
    `;
  } catch (e) {
    console.error("[webhook-pagbank] Erro ao atualizar gateway_payload:", e);
  }
}
