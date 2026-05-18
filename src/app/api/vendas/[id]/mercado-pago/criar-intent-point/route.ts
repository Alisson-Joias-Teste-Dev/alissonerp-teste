import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPointIntent, cancelPointIntent } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CriarIntentPointSchema = z.object({
  device_id: z.string().min(1, "obrigatório"),
  valor: z.coerce.number().optional(),
  installments: z.coerce.number().int().optional(),
  payment_type: z.enum(["credit_card", "debit_card", "pix"]).optional(),
  pagamento_id: z.coerce.number().int().positive().optional(),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = CriarIntentPointSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

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

  if (Number(soma_confirmados) + 0.01 >= totalVenda) {
    return NextResponse.json({ error: "Venda já está totalmente paga — não é possível gerar cobrança na maquininha" }, { status: 409 });
  }

  const valorCobranca = body.valor != null ? Math.min(Number(body.valor), restante) : restante;

  if (!valorCobranca || valorCobranca <= 0) {
    return NextResponse.json({ error: "Valor da cobrança deve ser > 0" }, { status: 400 });
  }
  if (valorCobranca < 1.00) {
    return NextResponse.json({ error: "Valor mínimo para cobrança na maquininha é R$ 1,00" }, { status: 400 });
  }

  // ─── Cria ou reusa pagamento pendente ────────────────────────────────────
  let pagamentoId: number;
  if (body.pagamento_id) {
    const [pre] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE id = ${body.pagamento_id} AND venda_id = ${vendaId} AND status = 'pendente'
      LIMIT 1
    `;
    if (pre) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway = 'Mercado Pago Point',
            valor = ${valorCobranca}, parcelas = ${body.installments ?? 1}
        WHERE id = ${pre.id}
      `;
      pagamentoId = Number(pre.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, gateway, valor, parcelas, status)
        VALUES (${vendaId}, 'Cartão de Crédito', 'Mercado Pago Point', ${valorCobranca}, ${body.installments ?? 1}, 'pendente')
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  } else {
    const [pag] = await sql`
      INSERT INTO alissonerp.pagamentos_venda (
        venda_id, forma, gateway, valor, parcelas, status
      ) VALUES (
        ${vendaId}, 'Cartão de Crédito', 'Mercado Pago Point',
        ${valorCobranca}, ${body.installments ?? 1}, 'pendente'
      )
      RETURNING id
    `;
    pagamentoId = Number(pag.id);
  }

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
    const internalMsg = err instanceof Error ? err.message : "Erro ao criar intent MP";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: internalMsg, device_id: body.device_id, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return internalError("[POST /api/vendas/[id]/mercado-pago/criar-intent-point]", err, "Erro ao criar intent MP", 502);
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
    const internalMsg = err instanceof Error ? err.message : "Erro ao cancelar";
    // 404 = intent já processada ou expirada no MP — trata como cancelamento bem-sucedido
    const isGone = internalMsg.includes("404") || internalMsg.toLowerCase().includes("not found") || internalMsg.toLowerCase().includes("doesn't exist");
    if (!isGone) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway_payload = ${JSON.stringify({
          ...(payload ?? {}),
          cancel_error: internalMsg,
          cancelado_em: new Date().toISOString(),
        })}::text::jsonb
        WHERE id = ${pagamentoId}
      `;
      return internalError("[DELETE /api/vendas/[id]/mercado-pago/criar-intent-point]", err, "Erro ao cancelar intent MP", 502);
    }
    // isGone: continua para marcar como cancelado no banco
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
