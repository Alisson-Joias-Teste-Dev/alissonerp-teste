import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/mercado-pago";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { internalError } from "@/lib/api-error";

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/vendas/[id]/mercado-pago/checar-point?pagamento_id=Y
//
// Polling ativo para intents MP Point quando o webhook não chega.
// Busca o pagamento por external_reference no MP API. Se aprovado,
// confirma no banco — mesma lógica do webhook handler.
// Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda
// (status só muda na entrega: aprovado → em_rota → entregue).
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const pagamentoId = Number(new URL(req.url).searchParams.get("pagamento_id"));
  if (!pagamentoId) return NextResponse.json({ error: "pagamento_id obrigatório" }, { status: 400 });

  // Onda 1D: bloqueia consultora de pollar pagamento de venda alheia
  const [usuarioAuth] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuarioAuth) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    await requireVendaOwnership({ id: user.id, role: usuarioAuth.role, email: user.email ?? "" }, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Carrega pagamento
  const [pag] = await sql`
    SELECT id, venda_id, status, valor, gateway_payload
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
      AND gateway = 'Mercado Pago Point'
  `;
  if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });

  // Já confirmado — retorna direto
  if (pag.status === "confirmado") {
    return NextResponse.json({ ok: true, status: "confirmado", ja_confirmado: true });
  }
  if (pag.status === "cancelado") {
    return NextResponse.json({ ok: true, status: "cancelado" });
  }

  // Busca no MP por external_reference
  const externalReference = `venda:${vendaId}:pag:${pagamentoId}`;
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return internalError("[GET /api/vendas/[id]/mercado-pago/checar-point] getAccessToken", err, "MP não configurado", 502);
  }

  const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc&limit=5`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!searchRes.ok) {
    return NextResponse.json({ ok: false, mp_pending: true, status: "pendente" });
  }

  const searchData = await searchRes.json() as { results?: Array<{ id: number; status: string; transaction_amount?: number; transaction_details?: { net_received_amount?: number }; fee_details?: Array<{ amount?: number }> }> };
  const results = searchData.results ?? [];

  // Procura um pagamento aprovado
  const approvedPayment = results.find(r => r.status === "approved");
  if (!approvedPayment) {
    // Nenhum pagamento aprovado — retorna o status mais recente se houver
    const latest = results[0];
    return NextResponse.json({ ok: true, status: latest?.status ?? "pendente", mp_pending: true });
  }

  // Pagamento aprovado — confirmar no banco (igual ao webhook handler)
  const paymentId = String(approvedPayment.id);
  const transactionAmount = Number(approvedPayment.transaction_amount ?? 0);
  const txDetails = approvedPayment.transaction_details;
  const netReceivedAmount = txDetails?.net_received_amount != null ? Number(txDetails.net_received_amount) : null;
  const valorLiquido = netReceivedAmount != null ? netReceivedAmount : transactionAmount;
  const taxasMP = Math.max(0, Number((transactionAmount - valorLiquido).toFixed(2)));

  const payloadAntigo = (pag.gateway_payload as Record<string, unknown> | null) ?? {};
  const novoPayload = {
    ...payloadAntigo,
    ultimo_payment_id: paymentId,
    ultimo_status: "approved",
    ultimo_update: new Date().toISOString(),
    transaction_amount: transactionAmount,
    net_received_amount: netReceivedAmount,
    taxas_mp_total: taxasMP,
    confirmado_via: "polling_checar_point",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (sql as any).begin(async (tx: typeof sql) => {
    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET
        status           = 'confirmado',
        data_confirmacao = NOW(),
        gateway_id       = ${paymentId},
        valor_liquido    = ${valorLiquido},
        taxas_mp         = ${taxasMP},
        gateway_payload  = ${JSON.stringify(novoPayload)}::text::jsonb
      WHERE id = ${pagamentoId}
    `;

    const [{ soma_confirmados, total_venda }] = await tx`
      SELECT
        COALESCE((SELECT SUM(valor) FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} AND status = 'confirmado'), 0)::numeric AS soma_confirmados,
        (SELECT total_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId})::numeric AS total_venda
    `;

    const pago = Number(soma_confirmados);
    const total = Number(total_venda);
    const quitada = pago + 0.01 >= total;
    return { quitada, pago, total };
  });

  // Fluxo novo 06/2026: pagamento quitado NÃO conclui mais a venda.
  return NextResponse.json({
    ok: true,
    status: "confirmado",
    payment_id: paymentId,
    pagamento_quitado: result.quitada,
  });
}
