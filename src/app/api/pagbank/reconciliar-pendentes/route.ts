/**
 * POST /api/pagbank/reconciliar-pendentes
 *
 * Ferramenta de reconciliação: busca pagamentos PagBank pendentes
 * dos últimos 30 dias e confirma os que estão PAID na API PagBank.
 * Útil quando webhooks se perdem por problemas de rede.
 *
 * Acesso: admin / desenvolvedor / diretor
 */
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { buscarPedido, centavosParaReais } from "@/lib/pagbank";
import {
  confirmarPagamentoVenda,
  devolverSaldoGerente,
  baixarContaReceber,
  registrarComunicacaoRecebimento,
  autoAprovarVendaRascunho,
  autoConcluirVendaSeQuitada,
  buscarPagamentoAReceberPendente,
} from "@/lib/baixa-credito";

const PODE_RECONCILIAR = ["desenvolvedor", "admin", "diretor"];

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !PODE_RECONCILIAR.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Busca pagamentos PagBank pendentes dos últimos 30 dias
  const pagamentos = await sql`
    SELECT id, venda_id, gateway_id, gateway, valor, status
    FROM alissonerp.pagamentos_venda
    WHERE gateway LIKE 'PagBank%'
      AND status = 'pendente'
      AND gateway_id IS NOT NULL
      AND data_confirmacao IS NULL
      AND id IN (
        SELECT DISTINCT pv.id
        FROM alissonerp.pagamentos_venda pv
        JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
        WHERE v.created_at >= NOW() - INTERVAL '30 days'
      )
    ORDER BY id
  `;

  if (pagamentos.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: "Nenhum pagamento PagBank pendente encontrado" });
  }

  let confirmados = 0;
  let erros = 0;
  const detalhes: Array<Record<string, unknown>> = [];

  for (const pag of pagamentos) {
    const orderId = String(pag.gateway_id);
    const vendaId = Number(pag.venda_id);

    try {
      // Busca status no PagBank
      let pbStatus: string | null = null;
      let pbValorCentavos = 0;

      if (orderId.startsWith("ORDE_")) {
        const order = await buscarPedido(orderId);
        const charge = order.charges?.[0];
        pbStatus = charge?.status ?? order.status ?? null;
        pbValorCentavos = charge?.amount?.value ?? 0;
      } else {
        // charge ID direto
        const { buscarCobranca } = await import("@/lib/pagbank");
        const charge = await buscarCobranca(orderId);
        pbStatus = charge.status ?? null;
        pbValorCentavos = charge.amount?.value ?? 0;
      }

      if (pbStatus !== "PAID") {
        detalhes.push({
          pagamento_id: pag.id,
          venda_id: vendaId,
          order_id: orderId,
          status: pbStatus,
          acao: "ignorado",
        });
        continue;
      }

      // Pagamento PAID — confirmar
      const valorReais = centavosParaReais(pbValorCentavos);
      const valorEfetivo = Math.min(valorReais, Number(pag.valor));

      await confirmarPagamentoVenda(sql, pag.id, {
        valorEfetivo,
        gateway: String(pag.gateway),
        gatewayId: orderId,
        source: "reconciliacao_pagbank",
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
        const ehParcial = Math.abs(valorEfetivo - pagPendente.valor) > 0.10;
        const valorEfetivoCr = ehParcial ? Math.min(valorEfetivo, pagPendente.valor) : pagPendente.valor;
        const valorRestante = ehParcial ? pagPendente.valor - valorEfetivoCr : 0;

        await baixarContaReceber(sql, vendaId, {
          valorPago: valorEfetivoCr,
          valorRestante,
          userId: user.id,
          formaRecebimento: "PagBank",
        });

        // Registra comunicação
        try {
          const contas = await sql<{ id: number }[]>`
            SELECT id FROM alissonerp.contas_receber
            WHERE venda_erp_id = ${vendaId} AND situacao = 'pago'
            ORDER BY updated_at DESC LIMIT 1
          `;
          for (const c of contas) {
            await registrarComunicacaoRecebimento(sql, c.id, {
              mensagem: `Recebido via PagBank (reconciliação) — Order ${orderId} | R$ ${valorReais.toFixed(2)}`,
              userId: user.id,
            });
          }
        } catch (err) {
          console.error("[reconciliar-pendentes] Erro ao registrar comunicação:", err);
        }
      }

      // Auto-aprovar e auto-concluir
      await autoAprovarVendaRascunho(sql, vendaId, user.id);
      await autoConcluirVendaSeQuitada(sql, vendaId, user.id);

      confirmados++;
      detalhes.push({
        pagamento_id: pag.id,
        venda_id: vendaId,
        order_id: orderId,
        status: "PAID",
        valor_reais: valorReais,
        acao: "confirmado",
      });

      console.log(
        `[reconciliar-pendentes] Confirmado: venda=${vendaId} pag=${pag.id} ` +
        `order=${orderId} valor=R$${valorReais.toFixed(2)}`,
      );
    } catch (err) {
      erros++;
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[reconciliar-pendentes] Erro pagamento=${pag.id}:`, err);
      detalhes.push({
        pagamento_id: pag.id,
        venda_id: vendaId,
        order_id: orderId,
        erro: msg,
        acao: "erro",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processados: pagamentos.length,
    confirmados,
    erros,
    detalhes,
  });
}
