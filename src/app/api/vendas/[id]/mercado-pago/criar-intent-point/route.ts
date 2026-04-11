import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPointIntent, cancelPointIntent } from "@/lib/mercado-pago";

// ═══════════════════════════════════════════════════════════════════════════
// POST   /api/vendas/[id]/mercado-pago/criar-intent-point
//   Dispara uma payment intent na maquininha selecionada.
//   Body: { device_id: string, valor?: number, installments?: number, payment_type?: "credit_card"|"debit_card" }
//
// DELETE /api/vendas/[id]/mercado-pago/criar-intent-point?pagamento_id=X
//   Cancela a intent ativa (antes do cliente passar o cartão).
// ═══════════════════════════════════════════════════════════════════════════

const ROLES_PERMITIDOS = [
  "desenvolvedor",
  "admin",
  "gerente_fabrica",
  "gerente_loja",
  "consultora",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const body = await req.json() as {
    device_id: string;
    valor?: number;
    installments?: number;
    payment_type?: "credit_card" | "debit_card";
  };

  if (!body.device_id) {
    return NextResponse.json({ error: "device_id obrigatório" }, { status: 400 });
  }

  // ─── Carrega venda ────────────────────────────────────────────────────────
  const [venda] = await sql`
    SELECT id, numero_venda, situacao, bloqueado, total_venda, vendedor_id
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json(
      { error: `Venda em situação '${venda.situacao}' não aceita cobrança MP` },
      { status: 409 }
    );
  }

  if (
    usuario.role === "consultora" &&
    usuario.vendedor_id &&
    venda.vendedor_id &&
    Number(usuario.vendedor_id) !== Number(venda.vendedor_id)
  ) {
    return NextResponse.json({ error: "Você só pode cobrar suas próprias vendas" }, { status: 403 });
  }

  // ─── Valida device ativo ──────────────────────────────────────────────────
  const [device] = await sql`
    SELECT device_id, nome_legivel, ativo
    FROM alissonerp.mp_point_devices
    WHERE device_id = ${body.device_id} AND ativo = true
  `;
  if (!device) {
    return NextResponse.json({ error: "Maquininha não encontrada ou inativa" }, { status: 404 });
  }

  // ─── Calcula valor ────────────────────────────────────────────────────────
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  const totalVenda = Number(venda.total_venda);
  const restante = Math.max(0, totalVenda - Number(soma_confirmados));
  const valorCobranca = body.valor != null ? Number(body.valor) : restante;

  if (!valorCobranca || valorCobranca <= 0) {
    return NextResponse.json({ error: "Valor da cobrança deve ser > 0" }, { status: 400 });
  }

  // ─── Cria pagamento pendente ──────────────────────────────────────────────
  const [pag] = await sql`
    INSERT INTO alissonerp.pagamentos_venda (
      venda_id, forma, gateway, valor, parcelas, status
    ) VALUES (
      ${vendaId}, 'Mercado Pago', 'Mercado Pago Point',
      ${valorCobranca}, ${body.installments ?? 1}, 'pendente'
    )
    RETURNING id
  `;
  const pagamentoId = Number(pag.id);

  // ─── Dispara intent na MP ─────────────────────────────────────────────────
  let intent;
  try {
    intent = await createPointIntent({
      deviceId: body.device_id,
      amountCents: Math.round(valorCobranca * 100), // MP Point exige centavos
      vendaId,
      pagamentoId,
      numeroVenda: String(venda.numero_venda),
      installments: body.installments ?? 1,
      paymentType: body.payment_type ?? "credit_card",
      printOnTerminal: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar intent MP";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: msg, device_id: body.device_id, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      gateway_id      = ${String(intent.id ?? "")},
      gateway_payload = ${JSON.stringify({
        tipo: "point_intent",
        intent_id: intent.id,
        device_id: body.device_id,
        device_nome: device.nome_legivel,
        state: intent.state,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    intent_id: intent.id,
    device_id: body.device_id,
    device_nome: device.nome_legivel,
    state: intent.state,
    valor: valorCobranca,
  });
}

// ─── DELETE: cancela intent ativa ─────────────────────────────────────────────
export async function DELETE(
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

  const [pag] = await sql`
    SELECT id, gateway_id, gateway_payload, status
    FROM alissonerp.pagamentos_venda
    WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
      AND gateway = 'Mercado Pago Point'
  `;
  if (!pag) return NextResponse.json({ error: "Pagamento Point não encontrado" }, { status: 404 });
  if (pag.status === "confirmado") {
    return NextResponse.json({ error: "Pagamento já confirmado — não dá pra cancelar" }, { status: 409 });
  }

  const payload = pag.gateway_payload as { device_id?: string; intent_id?: string } | null;
  const deviceId = payload?.device_id;
  const intentId = pag.gateway_id as string | null;

  if (!deviceId || !intentId) {
    return NextResponse.json({ error: "Intent não tem device_id/intent_id" }, { status: 400 });
  }

  try {
    await cancelPointIntent(deviceId, intentId);
  } catch (err: unknown) {
    // Pode falhar se a intent já expirou naturalmente na MP — não é erro crítico
    const msg = err instanceof Error ? err.message : "Erro ao cancelar";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({
        ...(payload ?? {}),
        cancel_error: msg,
        cancelado_em: new Date().toISOString(),
      })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ error: msg, pagamento_id: pagamentoId }, { status: 502 });
  }

  // Marca pagamento como cancelado (remover não é bom: preserva histórico)
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      status          = 'cancelado',
      gateway_payload = ${JSON.stringify({
        ...(payload ?? {}),
        cancelado_em: new Date().toISOString(),
        cancelado_por: user.id,
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({ ok: true, pagamento_id: pagamentoId });
}
