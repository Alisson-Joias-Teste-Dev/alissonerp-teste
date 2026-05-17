import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchPayment } from "@/lib/mercado-pago";
import { concluirVenda } from "@/lib/vendas-aprovar";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { internalError } from "@/lib/api-error";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/vendas/[id]/mercado-pago/verificar-manual
//
// Consulta um pagamento no Mercado Pago pelo ID informado pelo operador.
// Se estiver "approved", registra como pagamento confirmado na venda.
// Fallback para quando o financeiro automático (webhook/polling) falhar.
// ═══════════════════════════════════════════════════════════════════════════

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { payment_id?: string; pagamento_id?: number };
  const mpPaymentId = String(body.payment_id ?? "").trim();
  if (!mpPaymentId) return NextResponse.json({ error: "Informe o ID do pagamento" }, { status: 400 });
  const pagamentoIdExistente = body.pagamento_id ? Number(body.pagamento_id) : null;

  // Verificar se já está registrado
  const [duplicata] = await sql`
    SELECT id FROM alissonerp.pagamentos_venda
    WHERE gateway_id = ${mpPaymentId} LIMIT 1
  `;
  if (duplicata) {
    return NextResponse.json({ error: "Este pagamento já está registrado no sistema" }, { status: 409 });
  }

  // Carregar venda
  const [venda] = await sql`
    SELECT id, numero_venda, situacao, bloqueado, total_venda
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  // Onda 1D: consultora so confirma MP manual de venda propria
  try {
    await requireVendaOwnership({ id: user.id, role: usuario.role, email: user.email ?? "" }, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json({ error: `Venda em situação '${venda.situacao}'` }, { status: 409 });
  }

  // Consultar Mercado Pago
  let mpData: Awaited<ReturnType<typeof fetchPayment>>;
  try {
    mpData = await fetchPayment(mpPaymentId);
  } catch (e) {
    return internalError("[POST /api/vendas/[id]/mercado-pago/verificar-manual] fetchPayment", e, "Erro ao consultar MP", 502);
  }

  if (!mpData || mpData.status !== "approved") {
    return NextResponse.json({
      error: `Pagamento não aprovado no Mercado Pago (status: ${mpData?.status ?? "desconhecido"})`,
      mp_status: mpData?.status,
    }, { status: 422 });
  }

  const valorMp = Number(mpData.transaction_amount ?? 0);
  if (valorMp <= 0) {
    return NextResponse.json({ error: "Valor do pagamento inválido" }, { status: 422 });
  }

  // Mapear método MP → forma do ERP. payment_type_id pode ser:
  // credit_card | debit_card | pix | ticket (boleto) | bank_transfer | account_money
  const mpData2 = mpData as {
    payment_type_id?: string;
    payment_method_id?: string;
    transaction_details?: { net_received_amount?: number };
    fee_details?: Array<{ amount?: number }>;
    installments?: number;
  };
  const ptype = String(mpData2.payment_type_id ?? "").toLowerCase();
  const formaErp =
    ptype === "credit_card"   ? "Cartão de Crédito" :
    ptype === "debit_card"    ? "Cartão de Crédito" :  // ERP não tem Débito separado
    ptype === "pix"           ? "Pix" :
    ptype === "bank_transfer" ? "Pix" :
    ptype === "account_money" ? "Pix" :
    ptype === "ticket"        ? "A Receber" :          // boleto = a receber
    "Pix";                                              // fallback

  const netReceived = Number(mpData2.transaction_details?.net_received_amount ?? 0);
  const taxasMp = netReceived > 0 ? +(valorMp - netReceived).toFixed(2) : null;
  const valorLiquido = netReceived > 0 ? netReceived : null;
  const parcelasMp = Number(mpData2.installments ?? 1);

  // Calcular restante da venda — exclui confirmados sem data_confirmacao (preferences ghost)
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado' AND data_confirmacao IS NOT NULL
  `;
  const restante = Math.max(0, Number(venda.total_venda) - Number(soma_confirmados));
  if (restante <= 0.009) {
    return NextResponse.json({ error: "Venda já está totalmente paga" }, { status: 409 });
  }

  const valorRegistrar = Math.min(valorMp, restante);
  const dataConfirmacao = (mpData as { date_approved?: string }).date_approved
    ? new Date((mpData as { date_approved: string }).date_approved)
    : new Date();

  const gatewayPayload = {
    mp_id: mpPaymentId,
    mp_status: mpData.status,
    mp_valor: valorMp,
    mp_payment_type: ptype,
    mp_payment_method: mpData2.payment_method_id ?? null,
    mp_net_received: netReceived || null,
    mp_installments: parcelasMp,
    registrado_manualmente: true,
  };

  // Registrar pagamento e verificar conclusão dentro da mesma transação
  // para evitar race condition (duas requests simultâneas concluindo a venda duas vezes).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txResult = await (sql as any).begin(async (tx: typeof sql) => {
    let novoPagId: number;

    if (pagamentoIdExistente) {
      // Revalidar com FOR UPDATE para garantir atomicidade
      const [pagTx] = await tx`
        SELECT id FROM alissonerp.pagamentos_venda
        WHERE id = ${pagamentoIdExistente} AND venda_id = ${vendaId}
        FOR UPDATE
      `;
      if (!pagTx) return { erro: "Pagamento não encontrado nesta venda", status: 404 };

      await tx`
        UPDATE alissonerp.pagamentos_venda
        SET status = 'confirmado',
            forma = ${formaErp},
            gateway = 'Mercado Pago Manual',
            gateway_id = ${mpPaymentId},
            gateway_payload = ${JSON.stringify(gatewayPayload)}::jsonb,
            data_confirmacao = ${dataConfirmacao},
            valor = ${valorRegistrar},
            valor_liquido = ${valorLiquido},
            taxas_mp = ${taxasMp},
            parcelas = ${parcelasMp}
        WHERE id = ${pagamentoIdExistente} AND venda_id = ${vendaId}
      `;
      novoPagId = pagamentoIdExistente;
    } else {
      const [novoPag] = await tx`
        INSERT INTO alissonerp.pagamentos_venda
          (venda_id, forma, gateway, valor, parcelas, status, gateway_id, gateway_payload,
           data_confirmacao, valor_liquido, taxas_mp)
        VALUES (
          ${vendaId}, ${formaErp}, 'Mercado Pago Manual', ${valorRegistrar}, ${parcelasMp}, 'confirmado',
          ${mpPaymentId}, ${JSON.stringify(gatewayPayload)}::jsonb,
          ${dataConfirmacao}, ${valorLiquido}, ${taxasMp}
        )
        RETURNING id
      `;
      novoPagId = novoPag.id;
    }

    // Recalcular dentro da tx com o mesmo critério de data_confirmacao IS NOT NULL
    const [{ nova_soma, total_venda_tx }] = await tx`
      SELECT
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS nova_soma,
        v.total_venda::numeric AS total_venda_tx
      FROM alissonerp.vendas_erp v
      LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
      WHERE v.id = ${vendaId}
      GROUP BY v.total_venda
    `;

    const quitada = Number(nova_soma) >= Number(total_venda_tx) - 0.01;
    return { novoPagId, quitada, nova_soma: Number(nova_soma), total_venda_tx: Number(total_venda_tx) };
  });

  if (txResult?.erro) {
    return NextResponse.json({ error: txResult.erro }, { status: txResult.status ?? 500 });
  }

  const { novoPagId, quitada } = txResult;

  let vendaConcluida = false;
  if (quitada && venda.situacao === "aprovado") {
    try {
      await concluirVenda(vendaId, user.id, { tinyBestEffort: true });
      vendaConcluida = true;
    } catch (err) {
      console.error("[verificar-manual] Erro ao concluir venda:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    pagamento_id: novoPagId,
    valor_registrado: valorRegistrar,
    mp_status: mpData.status,
    venda_concluida: vendaConcluida,
  });
}
