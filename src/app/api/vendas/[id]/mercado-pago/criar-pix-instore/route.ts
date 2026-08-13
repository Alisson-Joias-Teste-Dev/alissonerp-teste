import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createInStorePixQr, getWebhookBaseUrl } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CriarPixInstoreSchema = z.object({
  valor: z.coerce.number().optional(),
  pagamento_id: z.coerce.number().int().positive().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/vendas/[id]/mercado-pago/criar-pix-instore
//
// Gera um PIX via In-Store QR Code API (taxa 0%, igual maquininha).
// Diferente do /criar-pix (Payment API com taxa), aqui usa a API de PDV.
// O QR retornado é exibido na tela — cliente escaneia com qualquer app PIX.
// Webhook confirma automaticamente via external_reference.
// ═══════════════════════════════════════════════════════════════════════════

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];

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

  const [venda] = await sql`
    SELECT id, numero_venda, situacao, bloqueado, total_venda, vendedor_id
    FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json({ error: `Venda em situação '${venda.situacao}' não aceita cobrança Pix` }, { status: 409 });
  }

  if (
    usuario.role === "consultora" &&
    usuario.vendedor_id && venda.vendedor_id &&
    Number(usuario.vendedor_id) !== Number(venda.vendedor_id)
  ) {
    return NextResponse.json({ error: "Você só pode cobrar suas próprias vendas" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CriarPixInstoreSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ─── Calcula valor ────────────────────────────────────────────────────────
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  const totalVenda = Number(venda.total_venda);
  const restante = Math.max(0, totalVenda - Number(soma_confirmados));

  if (Number(soma_confirmados) + 0.01 >= totalVenda) {
    return NextResponse.json({ error: "Venda já está totalmente paga — não é possível gerar novo Pix" }, { status: 409 });
  }

  const valorCobranca = body.valor != null ? Math.min(Number(body.valor), restante) : restante;

  if (!valorCobranca || valorCobranca <= 0) {
    return NextResponse.json({ error: "Valor da cobrança deve ser > 0" }, { status: 400 });
  }

  // ─── Cria ou reusa pagamento pendente ─────────────────────────────────────
  let pagamentoId: number;

  if (body.pagamento_id) {
    // Múltiplas: usa o registro pré-criado específico deste widget
    const [pre] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE id = ${body.pagamento_id} AND venda_id = ${vendaId} AND status = 'pendente'
      LIMIT 1
    `;
    if (pre) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET forma = 'Pix', gateway = 'Mercado Pago Pix In-Store', valor = ${valorCobranca}
        WHERE id = ${pre.id}
      `;
      pagamentoId = Number(pre.id);
    } else {
      // Registro não encontrado (removido ou já confirmado) — cria novo
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, gateway, valor, parcelas, status)
        VALUES (${vendaId}, 'Pix', 'Mercado Pago Pix In-Store', ${valorCobranca}, 1, 'pendente')
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  } else {
    const [existente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Pix' AND status = 'pendente'
        AND gateway = 'Mercado Pago Pix In-Store'
      ORDER BY id LIMIT 1
    `;
    if (existente) {
      await sql`
        UPDATE alissonerp.pagamentos_venda SET valor = ${valorCobranca} WHERE id = ${existente.id}
      `;
      pagamentoId = Number(existente.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, gateway, valor, parcelas, status)
        VALUES (${vendaId}, 'Pix', 'Mercado Pago Pix In-Store', ${valorCobranca}, 1, 'pendente')
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  }

  // ─── Chama In-Store QR API ────────────────────────────────────────────────
  const origin = new URL(req.url).origin;
  const baseUrl = await getWebhookBaseUrl(origin);

  let qr: { qr_data: string; in_store_order_id: string };
  try {
    qr = await createInStorePixQr({
      vendaId,
      pagamentoId,
      numeroVenda: String(venda.numero_venda),
      valor: valorCobranca,
      notificationUrl: `${baseUrl}/api/webhooks/mercado-pago`,
      expiraEmMinutos: 30,
    });
  } catch (err: unknown) {
    const internalMsg = err instanceof Error ? err.message : "Erro ao gerar PIX In-Store";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: internalMsg, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return internalError("[POST /api/vendas/[id]/mercado-pago/criar-pix-instore]", err, "Erro ao gerar PIX In-Store", 502);
  }

  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET gateway_payload = ${JSON.stringify({
      tipo: "pix_instore",
      in_store_order_id: qr.in_store_order_id,
      criado_em: new Date().toISOString(),
      criado_por: user.id,
    })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    qr_code: qr.qr_data,
    valor: valorCobranca,
  });
}
