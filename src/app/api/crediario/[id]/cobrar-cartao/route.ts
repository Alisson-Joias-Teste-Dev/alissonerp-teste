// ═══════════════════════════════════════════════════════════════════════════
// POST   /api/crediario/[id]/cobrar-cartao   → dispara cobrança na maquininha (Point)
// DELETE /api/crediario/[id]/cobrar-cartao    → cancela a intent (reseta o A Receber)
// [id] = conta_receber_id
//
// Cartão de crédito na MAQUININHA pelo fluxo VALIDADO (igual ao pedido). Amarra
// a intent ao pagamento "A Receber" da venda (external_reference venda:X:pag:Y).
// Quando o cliente passa o cartão, o WEBHOOK do MP confirma e FECHA a conta a
// receber (ver crediario-baixa-automatica.ts). O front faz polling em
// GET /api/crediario/[id] até a conta virar 'pago'. NÃO confirma nada aqui.
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPointIntent, cancelPointIntent } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CobrarCartaoSchema = z.object({
  device_id: z.string().min(1, "Informe a maquininha"),
  installments: z.coerce.number().int().min(1).max(12).optional(),
}).passthrough();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = CobrarCartaoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ── Conta a receber ────────────────────────────────────────────────────────
  const [conta] = await sql`
    SELECT id, situacao, valor, venda_erp_id
    FROM alissonerp.contas_receber
    WHERE id = ${contaId} AND categoria = 'venda'
  `;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  if (conta.situacao === "pago") {
    return NextResponse.json({ ok: true, ja_pago: true, message: "Conta já estava paga" });
  }
  if (conta.situacao !== "pendente") {
    return NextResponse.json({ error: "Conta não está pendente" }, { status: 409 });
  }

  const vendaId = conta.venda_erp_id as number | null;
  if (!vendaId) {
    return NextResponse.json({ error: "Conta sem venda vinculada" }, { status: 400 });
  }

  const valorCobranca = Number(conta.valor);
  if (valorCobranca < 1.0) {
    return NextResponse.json({ error: "Valor mínimo para a maquininha é R$ 1,00" }, { status: 400 });
  }

  // ── Pagamento "A Receber" pendente (alvo do external_reference) ─────────────
  const [pagamento] = await sql`
    SELECT id FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    ORDER BY id LIMIT 1
  `;
  if (!pagamento) {
    return NextResponse.json(
      { error: "Pagamento 'A Receber' pendente não encontrado para esta venda" },
      { status: 409 },
    );
  }

  // ── Valida maquininha ativa ────────────────────────────────────────────────
  const [device] = await sql`
    SELECT device_id, nome_legivel FROM alissonerp.mp_point_devices
    WHERE device_id = ${body.device_id} AND ativo = true
  `;
  if (!device) {
    return NextResponse.json({ error: "Maquininha não encontrada ou inativa" }, { status: 404 });
  }

  const [venda] = await sql`
    SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // ── Dispara intent na maquininha, amarrada ao pagamento A Receber ──────────
  let intent;
  try {
    intent = await createPointIntent({
      deviceId: body.device_id,
      amountCents: Math.round(valorCobranca * 100),
      vendaId,
      pagamentoId: Number(pagamento.id),
      numeroVenda: String(venda.numero_venda),
      installments: body.installments ?? 1,
      paymentType: "credit_card",
      printOnTerminal: true,
    });
  } catch (err) {
    return internalError("[POST /api/crediario/[id]/cobrar-cartao] createPointIntent", err, "Erro ao enviar para a maquininha", 502);
  }

  // ── Persiste a intent no pagamento A Receber (sem confirmar) ───────────────
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET gateway = 'Mercado Pago Point',
        gateway_id = ${String(intent.id ?? "")},
        parcelas = ${body.installments ?? 1},
        gateway_payload = ${JSON.stringify({
          tipo: "point_intent_crediario",
          intent_id: intent.id,
          device_id: body.device_id,
          device_nome: device.nome_legivel,
          state: intent.state,
          conta_receber_id: contaId,
          criado_em: new Date().toISOString(),
        })}::text::jsonb
    WHERE id = ${pagamento.id}
  `;

  return NextResponse.json({
    ok: true,
    intent_id: intent.id,
    device_nome: device.nome_legivel,
    state: intent.state,
    valor: valorCobranca,
  });
}

// ── DELETE: cancela a intent e RESETA o pagamento A Receber (não o perde) ─────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [conta] = await sql`
    SELECT venda_erp_id FROM alissonerp.contas_receber WHERE id = ${contaId} AND categoria = 'venda'
  `;
  if (!conta?.venda_erp_id) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const [pag] = await sql`
    SELECT id, gateway_id, gateway_payload, status
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${conta.venda_erp_id} AND forma = 'A Receber'
      AND gateway = 'Mercado Pago Point' AND status = 'pendente'
    ORDER BY id LIMIT 1
  `;
  if (!pag) return NextResponse.json({ ok: true, nada_a_cancelar: true });

  const payload = pag.gateway_payload as { device_id?: string; intent_id?: string } | null;
  const deviceId = payload?.device_id;
  const intentId = pag.gateway_id as string | null;

  if (deviceId && intentId) {
    try {
      await cancelPointIntent(deviceId, intentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const isGone = msg.includes("404") || msg.toLowerCase().includes("not found");
      if (!isGone) {
        return internalError("[DELETE /api/crediario/[id]/cobrar-cartao] cancelPointIntent", err, "Erro ao cancelar na maquininha", 502);
      }
    }
  }

  // Reseta o A Receber pra pendente "limpo" (NÃO cancela o pagamento — ele
  // continua sendo a conta a receber em aberto).
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET gateway = NULL, gateway_id = NULL, gateway_payload = NULL
    WHERE id = ${pag.id}
  `;

  return NextResponse.json({ ok: true, cancelado: true });
}
