/**
 * POST /api/vendas/[id]/pagbank/verificar-manual
 *
 * Verificação manual de pagamento PagBank. O operador informa um
 * order_id ou charge_id do PagBank, o sistema consulta a API e confirma
 * o pagamento se estiver aprovado.
 *
 * Fluxo:
 *   1. Autentica e verifica permissão
 *   2. Busca pagamento no PagBank (order ou charge)
 *   3. Se status=PAID, confirma no ERP usando baixa-credito.ts:
 *      - confirmarPagamentoVenda() com gateway="PagBank"
 *      - devolverSaldoGerente()
 *      - baixarContaReceber()
 *      - registrarComunicacaoRecebimento()
 *      - autoAprovarVendaRascunho()
 *      (fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda —
 *       o status só muda na entrega)
 *   4. Retorna status da verificação
 *
 * Gateway: "PagBank Manual"
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { buscarPedido, buscarCobranca, centavosParaReais } from "@/lib/pagbank";
import {
  confirmarPagamentoVenda,
  devolverSaldoGerente,
  baixarContaReceber,
  registrarComunicacaoRecebimento,
  autoAprovarVendaRascunho,
  buscarPagamentoAReceberPendente,
} from "@/lib/baixa-credito";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const VerificarManualSchema = z.object({
  payment_id: z.string().min(1, "Informe o ID do pedido ou cobrança PagBank").max(100),
}).passthrough();

const PODE_VERIFICAR = [
  "desenvolvedor",
  "admin",
  "gerente_loja",
  "gerente_fabrica",
  "diretor",
  "consultora",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!PODE_VERIFICAR.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = VerificarManualSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const paymentId = body.payment_id.trim();

  // Guard duplicata: já existe este payment_id?
  const [duplicata] = await sql`
    SELECT id FROM alissonerp.pagamentos_venda
    WHERE gateway_id = ${paymentId} LIMIT 1
  `;
  if (duplicata) {
    return NextResponse.json(
      { error: "Este pagamento PagBank já está registrado em outra venda" },
      { status: 409 },
    );
  }

  // Carrega venda
  const [venda] = await sql`
    SELECT id, numero_venda, situacao, credito_gerente_usado, created_by
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Busca pagamento no PagBank (tenta como order, fallback para charge)
  let pbStatus: string | null = null;
  let pbValorCentavos = 0;
  let pbTipo = "";

  try {
    if (paymentId.startsWith("ORDE_")) {
      const order = await buscarPedido(paymentId);
      const charge = order.charges?.[0];
      pbStatus = charge?.status ?? order.status ?? null;
      pbValorCentavos = charge?.amount?.value ?? 0;
      pbTipo = charge?.payment_method?.type ?? "";
    } else {
      const charge = await buscarCobranca(paymentId);
      pbStatus = charge.status ?? null;
      pbValorCentavos = charge.amount?.value ?? 0;
      pbTipo = charge.payment_method?.type ?? "";
    }
  } catch (err) {
    return internalError(
      "[POST /api/vendas/[id]/pagbank/verificar-manual] buscarPagamento",
      err,
      "Erro ao consultar PagBank",
      502,
    );
  }

  if (!pbStatus || pbStatus !== "PAID") {
    return NextResponse.json(
      {
        error: `Pagamento PagBank não aprovado. Status atual: "${pbStatus ?? "desconhecido"}"`,
        pb_status: pbStatus,
      },
      { status: 422 },
    );
  }

  const valorPbReais = centavosParaReais(pbValorCentavos);

  // Busca pagamento "A Receber" pendente na venda
  const pagPendente = await buscarPagamentoAReceberPendente(sql, vendaId);

  // Confirma pagamento_venda (se encontrou um A Receber pendente)
  let pagamentoId: number | null = null;
  if (pagPendente) {
    pagamentoId = pagPendente.id;
    const ehParcial = Math.abs(valorPbReais - pagPendente.valor) > 0.10;
    const valorEfetivo = ehParcial ? Math.min(valorPbReais, pagPendente.valor) : pagPendente.valor;

    await confirmarPagamentoVenda(sql, pagPendente.id, {
      valorEfetivo,
      gateway: "PagBank Manual",
      gatewayId: paymentId,
    });

    // Se parcial, cria split
    if (ehParcial && valorEfetivo < pagPendente.valor) {
      const valorRestante = pagPendente.valor - valorEfetivo;
      const { criarPagamentoSplit } = await import("@/lib/baixa-credito");
      await criarPagamentoSplit(sql, vendaId, valorRestante);
    }
  } else {
    // Não tem A Receber pendente — pode ser verificação de um pagamento
    // que foi criado como Cartão/Pix PagBank e confirmado pelo webhook
    // Neste caso, apenas registra a verificação
    console.log(`[verificar-manual-pb] venda ${vendaId}: nenhum pagamento A Receber pendente encontrado. Verificação manual de ${paymentId}`);
  }

  // Devolve saldo ao gerente se crédito foi usado
  let saldoDevolvido = false;
  const creditoUsado = parseFloat(venda?.credito_gerente_usado ?? "0");
  if (creditoUsado > 0 && pagamentoId) {
    const result = await devolverSaldoGerente(sql, vendaId, valorPbReais, pagamentoId, user.id);
    saldoDevolvido = result.devolvido;
  }

  // Baixa contas_receber
  const valorPagamento = pagPendente?.valor ?? valorPbReais;
  const ehParcial = Math.abs(valorPbReais - valorPagamento) > 0.10;
  const valorEfetivo = ehParcial ? Math.min(valorPbReais, valorPagamento) : valorPagamento;
  const valorRestante = ehParcial ? valorPagamento - valorEfetivo : 0;

  await baixarContaReceber(sql, vendaId, {
    valorPago: valorEfetivo,
    valorRestante,
    userId: user.id,
    formaRecebimento: "PagBank",
  });

  // Registra comunicação
  try {
    const contas = await sql<{ id: number }[]>`
      SELECT id FROM alissonerp.contas_receber
      WHERE venda_erp_id = ${vendaId} AND situacao = 'pago'
    `;
    for (const c of contas) {
      await registrarComunicacaoRecebimento(sql, c.id, {
        mensagem: `Recebido via PagBank Manual (ID ${paymentId}) — R$ ${valorPbReais.toFixed(2)} | Tipo: ${pbTipo || "desconhecido"}`,
        userId: user.id,
      });
    }
  } catch (err) {
    console.error("[verificar-manual-pb] Erro ao registrar comunicação:", err);
  }

  // Auto-aprovar se rascunho com crédito. Fluxo novo 06/2026: pagamento
  // quitado NÃO conclui mais a venda (status só muda na entrega).
  let vendaAprovada = false;
  if (venda?.situacao === "rascunho") {
    vendaAprovada = await autoAprovarVendaRascunho(sql, vendaId, user.id);
  }

  return NextResponse.json({
    ok: true,
    pb_status: pbStatus,
    pb_valor: valorPbReais,
    pb_tipo: pbTipo,
    saldo_devolvido: saldoDevolvido,
    venda_aprovada: vendaAprovada,
    pagamento_confirmado: pagamentoId != null,
  });
}
