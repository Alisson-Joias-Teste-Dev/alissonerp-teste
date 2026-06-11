/**
 * GET /api/vendas/[id]/pagbank/checar-point
 *
 * Polling de confirmação de pagamento PagBank (fallback do webhook).
 * Busca o pedido PagBank pelo order_id salvo no pagamento_venda
 * e verifica se o status mudou para PAID.
 *
 * Usado pelo frontend para polling periódico quando o webhook pode
 * ter se perdido (problemas de rede, timeout, etc).
 */
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { buscarPedido, centavosParaReais } from "@/lib/pagbank";
import {
  confirmarPagamentoVenda,
  devolverSaldoGerente,
  baixarContaReceber,
  registrarComunicacaoRecebimento,
  autoAprovarVendaRascunho,
  buscarPagamentoAReceberPendente,
} from "@/lib/baixa-credito";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Busca pagamentos PagBank pendentes nesta venda
  const pagamentos = await sql`
    SELECT id, gateway_id, gateway, valor, status
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
      AND gateway LIKE 'PagBank%'
      AND status = 'pendente'
      AND gateway_id IS NOT NULL
    ORDER BY id
  `;

  if (pagamentos.length === 0) {
    return NextResponse.json({ ok: true, confirmados: 0, mensagem: "Nenhum pagamento PagBank pendente" });
  }

  let confirmados = 0;

  for (const pag of pagamentos) {
    const orderId = String(pag.gateway_id);

    try {
      const order = await buscarPedido(orderId);
      const charge = order.charges?.[0];

      if (charge?.status !== "PAID") {
        // Ainda não pago — atualiza gateway_payload com status atual
        await sql`
          UPDATE alissonerp.pagamentos_venda
          SET gateway_payload = COALESCE(gateway_payload, '{}'::jsonb)
              || ${JSON.stringify({
                ultimo_polling: {
                  charge_status: charge?.status ?? order.status,
                  verificado_em: new Date().toISOString(),
                },
              })}::jsonb
          WHERE id = ${pag.id}
        `;
        continue;
      }

      // Pagamento confirmado!
      const valorCentavos = charge.amount?.value ?? 0;
      const valorReais = centavosParaReais(valorCentavos);
      const valorEfetivo = Math.min(valorReais, Number(pag.valor));

      await confirmarPagamentoVenda(sql, pag.id, {
        valorEfetivo,
        gateway: String(pag.gateway),
        gatewayId: orderId,
        source: "polling_pagbank",
      });

      // Se valor pago < valor do pagamento, cria split
      if (valorEfetivo < Number(pag.valor)) {
        const valorRestante = Number(pag.valor) - valorEfetivo;
        const { criarPagamentoSplit } = await import("@/lib/baixa-credito");
        await criarPagamentoSplit(sql, vendaId, valorRestante);
      }

      // Devolve saldo ao gerente
      await devolverSaldoGerente(sql, vendaId, valorEfetivo, pag.id, user.id);

      // Baixa contas_receber
      const pagPendente = await buscarPagamentoAReceberPendente(sql, vendaId);
      if (pagPendente) {
        const ehParcialCr = Math.abs(valorEfetivo - pagPendente.valor) > 0.10;
        const valorEfetivoCr = ehParcialCr ? Math.min(valorEfetivo, pagPendente.valor) : pagPendente.valor;
        const valorRestanteCr = ehParcialCr ? pagPendente.valor - valorEfetivoCr : 0;

        await baixarContaReceber(sql, vendaId, {
          valorPago: valorEfetivoCr,
          valorRestante: valorRestanteCr,
          userId: user.id,
          formaRecebimento: "PagBank",
        });
      }

      // Registra comunicação
      try {
        const contas = await sql<{ id: number }[]>`
          SELECT id FROM alissonerp.contas_receber
          WHERE venda_erp_id = ${vendaId} AND situacao = 'pago'
          ORDER BY updated_at DESC LIMIT 1
        `;
        for (const c of contas) {
          await registrarComunicacaoRecebimento(sql, c.id, {
            mensagem: `Recebido via PagBank (polling) — Order ${orderId} | R$ ${valorReais.toFixed(2)}`,
            userId: user.id,
          });
        }
      } catch (err) {
        console.error("[checar-point-pb] Erro ao registrar comunicação:", err);
      }

      // Auto-aprovar venda em rascunho com crédito. Fluxo novo 06/2026:
      // pagamento quitado NÃO conclui mais a venda (status só muda na entrega).
      await autoAprovarVendaRascunho(sql, vendaId, user.id);

      confirmados++;
      console.log(
        `[checar-point-pb] Pagamento confirmado via polling: venda=${vendaId} ` +
        `pag=${pag.id} order=${orderId} valor=R$${valorReais.toFixed(2)}`,
      );
    } catch (err) {
      console.error(`[checar-point-pb] Erro ao checar order ${orderId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    confirmados,
    total_verificados: pagamentos.length,
  });
}
