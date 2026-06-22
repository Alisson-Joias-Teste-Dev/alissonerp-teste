// ═══════════════════════════════════════════════════════════════════════════
// POST /api/crediario/[id]/cobrar-pix
// [id] = conta_receber_id
//
// Gera um QR Pix do Mercado Pago para baixar uma conta "A Receber" do crediário
// pelo fluxo VALIDADO (igual ao pedido) — substitui a baixa manual sem prova.
//
// Amarra o pagamento ao "A Receber" da venda (external_reference venda:X:pag:Y,
// Y = pagamento A Receber). Quando o cliente paga, o WEBHOOK do MP confirma o
// pagamento e FECHA a conta a receber (ver crediario-baixa-automatica.ts) —
// devolvendo o saldo do gerente. O front só faz polling em GET /api/crediario/[id]
// até a conta virar 'pago'. NÃO marca nada como pago aqui (só o gateway confirma).
// ═══════════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPixPayment, getWebhookBaseUrl } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";

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

  // Gerar cobrança é seguro (não move dinheiro — só o webhook confirma).
  // Liberado para qualquer operador do crediário (consultora inclusa, que é
  // quem registra o pagamento — regra §6). Só exige usuário válido.
  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // ── Conta a receber ────────────────────────────────────────────────────────
  const [conta] = await sql`
    SELECT id, situacao, valor, venda_erp_id, descricao
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
    return NextResponse.json({ error: "Conta sem venda vinculada — não é possível cobrar via Pix" }, { status: 400 });
  }

  // ── Pagamento "A Receber" pendente da venda (alvo do external_reference) ────
  const [pagamento] = await sql`
    SELECT id, valor FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    ORDER BY id LIMIT 1
  `;
  if (!pagamento) {
    return NextResponse.json(
      { error: "Pagamento 'A Receber' pendente não encontrado para esta venda" },
      { status: 409 },
    );
  }

  // ── Dados do pagador (mesma montagem do criar-pix da venda) ────────────────
  const [venda] = await sql`
    SELECT v.numero_venda,
           c.nome      AS cliente_nome,
           c.cpf_cnpj  AS cliente_cpf_cnpj,
           c.email     AS cliente_email
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  const clienteNome = venda.cliente_nome ? String(venda.cliente_nome).trim() : "Cliente";
  const partesNome = clienteNome.split(/\s+/);
  const firstName = partesNome[0] || "Cliente";
  const lastName = partesNome.slice(1).join(" ") || "Alisson";
  const cpfLimpo = venda.cliente_cpf_cnpj ? String(venda.cliente_cpf_cnpj).replace(/\D/g, "") : undefined;
  const cpfValido = cpfLimpo && cpfLimpo.length === 11 ? cpfLimpo : undefined;
  const email = venda.cliente_email ? String(venda.cliente_email).trim() : `venda-${vendaId}@alissonjoias.com.br`;

  const valorCobranca = Number(conta.valor);

  // ── Dispara o Pix (Payment API) amarrado ao pagamento A Receber ────────────
  const origin = new URL(req.url).origin;
  const baseUrl = await getWebhookBaseUrl(origin);
  const notificationUrl = `${baseUrl}/api/webhooks/mercado-pago`;

  let pix;
  try {
    pix = await createPixPayment({
      vendaId,
      pagamentoId: Number(pagamento.id),
      numeroVenda: String(venda.numero_venda),
      valor: valorCobranca,
      descricao: `Crediário ${venda.numero_venda} - Alisson Joias`,
      payer: { email, first_name: firstName, last_name: lastName, cpf: cpfValido },
      notificationUrl,
      expiraEmMinutos: 30,
    });
  } catch (err) {
    return internalError("[POST /api/crediario/[id]/cobrar-pix] createPixPayment", err, "Erro ao gerar Pix MP", 502);
  }

  // ── Persiste o payment_id/QR no pagamento A Receber (sem confirmar) ─────────
  // O status segue 'pendente'; quem confirma é o webhook. Mantém o gateway_id
  // pra rastreio e idempotência (o webhook regrava o mesmo valor).
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET gateway = 'Mercado Pago Pix',
        gateway_id = ${pix.payment_id},
        gateway_payload = ${JSON.stringify({
          tipo: "pix_payment_crediario",
          payment_id: pix.payment_id,
          status: pix.status,
          conta_receber_id: contaId,
          gerado_em: new Date().toISOString(),
        })}::text::jsonb
    WHERE id = ${pagamento.id}
  `;

  return NextResponse.json({
    ok: true,
    payment_id: pix.payment_id,
    qr_code: pix.qr_code,
    qr_code_base64: pix.qr_code_base64,
    ticket_url: pix.ticket_url,
    expiration_date: pix.expiration_date,
    valor: valorCobranca,
  });
}
