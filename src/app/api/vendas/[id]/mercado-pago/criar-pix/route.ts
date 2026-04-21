import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPixPayment, getWebhookBaseUrl } from "@/lib/mercado-pago";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/vendas/[id]/mercado-pago/criar-pix
//
// Gera um PIX NATIVO (formato EMV/BR Code do Banco Central) via Payment API
// do Mercado Pago. Diferente do endpoint criar-link (que usa Preference e
// gera URL do checkout MP), aqui o QR retornado pode ser escaneado em
// qualquer app bancário.
//
// Body opcional: { pagamento_id?: number, valor?: number }
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

  // ─── Carrega venda + cliente ──────────────────────────────────────────────
  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda, v.situacao, v.bloqueado,
      v.total_venda, v.cliente_id, v.vendedor_id,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.email AS cliente_email
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json(
      { error: `Venda em situação '${venda.situacao}' não aceita cobrança Pix` },
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

  const body = await req.json().catch(() => ({})) as {
    pagamento_id?: number;
    valor?: number;
  };

  // ─── Calcula valor do pagamento ───────────────────────────────────────────
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
      AND status = 'confirmado'
      ${body.pagamento_id ? sql`AND id != ${body.pagamento_id}` : sql``}
  `;
  const totalVenda = Number(venda.total_venda);
  const restante = Math.max(0, totalVenda - Number(soma_confirmados));

  if (!body.pagamento_id && Number(soma_confirmados) + 0.01 >= totalVenda) {
    return NextResponse.json({ error: "Venda já está totalmente paga — não é possível gerar novo Pix" }, { status: 409 });
  }

  const valorCobranca = body.valor != null ? Math.min(Number(body.valor), restante) : restante;

  if (!valorCobranca || valorCobranca <= 0) {
    return NextResponse.json({ error: "Valor da cobrança deve ser > 0" }, { status: 400 });
  }

  // ─── Upsert pagamentos_venda ──────────────────────────────────────────────
  let pagamentoId: number;
  if (body.pagamento_id) {
    const [pag] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE id = ${body.pagamento_id} AND venda_id = ${vendaId}
    `;
    if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    pagamentoId = Number(pag.id);
  } else {
    // Reaproveitar pagamento Pix pendente existente (evita duplicata em Múltiplas)
    const [existente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Pix' AND status = 'pendente' AND gateway IS NULL
      ORDER BY id LIMIT 1
    `;
    if (existente) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway = 'Mercado Pago Pix', valor = ${valorCobranca}
        WHERE id = ${existente.id}
      `;
      pagamentoId = Number(existente.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (
          venda_id, forma, gateway, valor, parcelas, status
        ) VALUES (
          ${vendaId}, 'Pix', 'Mercado Pago Pix',
          ${valorCobranca}, 1, 'pendente'
        )
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  }

  // ─── Prepara payer (email obrigatório pelo Payment API) ───────────────────
  const clienteNome = venda.cliente_nome ? String(venda.cliente_nome).trim() : "Cliente";
  const partesNome = clienteNome.split(/\s+/);
  const firstName = partesNome[0] || "Cliente";
  const lastName = partesNome.slice(1).join(" ") || "Alisson";
  const cpfLimpo = venda.cliente_cpf_cnpj
    ? String(venda.cliente_cpf_cnpj).replace(/\D/g, "")
    : undefined;
  // MP aceita CPF (11) ou CNPJ (14) em identification.number, mas Payment
  // API com PIX aceita só CPF. Se for CNPJ, omite.
  const cpfValido = cpfLimpo && cpfLimpo.length === 11 ? cpfLimpo : undefined;

  // Email obrigatório — se cliente não tem, usa placeholder
  const email = venda.cliente_email
    ? String(venda.cliente_email).trim()
    : `venda-${vendaId}@alissonjoias.com.br`;

  // ─── Dispara o Payment API ────────────────────────────────────────────────
  const origin = new URL(req.url).origin;
  const baseUrl = await getWebhookBaseUrl(origin);
  const notificationUrl = `${baseUrl}/api/webhooks/mercado-pago`;

  let pix;
  try {
    pix = await createPixPayment({
      vendaId,
      pagamentoId,
      numeroVenda: String(venda.numero_venda),
      valor: valorCobranca,
      descricao: `Venda ${venda.numero_venda} - Alisson Joias`,
      payer: {
        email,
        first_name: firstName,
        last_name: lastName,
        cpf: cpfValido,
      },
      notificationUrl,
      expiraEmMinutos: 30,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao criar Pix MP";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: msg, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // ─── Persiste payment_id no pagamento ─────────────────────────────────────
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      gateway_id      = ${pix.payment_id},
      gateway_payload = ${JSON.stringify({
        tipo: "pix_payment",
        payment_id: pix.payment_id,
        status: pix.status,
        ticket_url: pix.ticket_url,
        expiration_date: pix.expiration_date,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    payment_id: pix.payment_id,
    qr_code: pix.qr_code,              // copia e cola EMV
    qr_code_base64: pix.qr_code_base64, // imagem PNG base64
    ticket_url: pix.ticket_url,
    expiration_date: pix.expiration_date,
    valor: valorCobranca,
    status: pix.status,
  });
}
