import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchPayment } from "@/lib/mercado-pago";
import { concluirVenda } from "@/lib/vendas-aprovar";

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

  const body = await req.json().catch(() => ({})) as { payment_id?: string };
  const mpPaymentId = String(body.payment_id ?? "").trim();
  if (!mpPaymentId) return NextResponse.json({ error: "Informe o ID do pagamento" }, { status: 400 });

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
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json({ error: `Venda em situação '${venda.situacao}'` }, { status: 409 });
  }

  // Consultar Mercado Pago
  let mpData: Awaited<ReturnType<typeof fetchPayment>>;
  try {
    mpData = await fetchPayment(mpPaymentId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Erro ao consultar MP: ${msg}` }, { status: 502 });
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

  // Calcular restante da venda
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  const restante = Math.max(0, Number(venda.total_venda) - Number(soma_confirmados));
  if (restante <= 0.009) {
    return NextResponse.json({ error: "Venda já está totalmente paga" }, { status: 409 });
  }

  const valorRegistrar = Math.min(valorMp, restante);

  // Registrar pagamento já confirmado
  const [novoPag] = await sql`
    INSERT INTO alissonerp.pagamentos_venda
      (venda_id, forma, gateway, valor, parcelas, status, gateway_id, gateway_payload, data_confirmacao)
    VALUES (
      ${vendaId}, 'Pix', 'Mercado Pago Manual', ${valorRegistrar}, 1, 'confirmado',
      ${mpPaymentId}, ${JSON.stringify({ mp_id: mpPaymentId, mp_status: mpData.status, mp_valor: valorMp, registrado_manualmente: true })}::jsonb,
      NOW()
    )
    RETURNING id
  `;

  // Concluir venda se totalmente paga
  const [{ nova_soma }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS nova_soma
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  let vendaConcluida = false;
  if (Number(nova_soma) >= Number(venda.total_venda) - 0.009 && venda.situacao === "aprovado") {
    try {
      await concluirVenda(vendaId, user.id, { tinyBestEffort: true });
      vendaConcluida = true;
    } catch (err) {
      console.error("[verificar-manual] Erro ao concluir venda:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    pagamento_id: novoPag.id,
    valor_registrado: valorRegistrar,
    mp_status: mpData.status,
    venda_concluida: vendaConcluida,
  });
}
