import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createPreference, getWebhookBaseUrl } from "@/lib/mercado-pago";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CriarLinkSchema = z.object({
  pagamento_id: z.coerce.number().int().positive().optional(),
  valor: z.coerce.number().optional(),
  installments: z.coerce.number().int().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/vendas/[id]/mercado-pago/criar-link
//
// Cria (ou regenera) uma Preference MP para a venda e devolve o init_point
// que a vendedora manda pro cliente. O pagamento MP é gravado em
// alissonerp.pagamentos_venda como `pendente` com gateway_id = preference.id.
//
// Body opcional:
//   { pagamento_id?: number, valor?: number }
// Se pagamento_id vem: regenera preference daquele pagamento existente.
// Senão: cria novo pagamento com valor = (total_venda - soma_confirmados) ou body.valor.
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

  // ─── Carrega venda + cliente + itens ──────────────────────────────────────
  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda, v.status AS situacao, v.bloqueado,
      v.total_venda, v.total_produtos, v.total_desconto, v.total_frete,
      v.cliente_id, v.vendedor_id, v.token_compartilhamento,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.email AS cliente_email
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json(
      { error: `Venda em situação '${venda.situacao}' não aceita cobrança MP` },
      { status: 409 }
    );
  }

  // Consultora só pode gerar link pra próprias vendas
  if (
    usuario.role === "consultora" &&
    usuario.vendedor_id &&
    venda.vendedor_id &&
    Number(usuario.vendedor_id) !== Number(venda.vendedor_id)
  ) {
    return NextResponse.json({ error: "Você só pode cobrar suas próprias vendas" }, { status: 403 });
  }

  const itens = await sql`
    SELECT nome_produto, quantidade, preco_unitario
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;
  if (itens.length === 0) {
    return NextResponse.json({ error: "Venda sem itens" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CriarLinkSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ─── Calcula valor do pagamento MP ────────────────────────────────────────
  // Se body.valor vem, usa ele. Senão: total_venda - soma(confirmados de outras formas).
  const [{ soma_confirmados }] = await sql`
    SELECT COALESCE(SUM(valor), 0)::numeric AS soma_confirmados
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
      AND status = 'confirmado'
      AND data_confirmacao IS NOT NULL
      ${body.pagamento_id ? sql`AND id != ${body.pagamento_id}` : sql``}
  `;
  const totalVenda = Number(venda.total_venda);
  const restante = Math.max(0, totalVenda - Number(soma_confirmados));

  if (!body.pagamento_id && Number(soma_confirmados) + 0.01 >= totalVenda) {
    return NextResponse.json({ error: "Venda já está totalmente paga — não é possível gerar novo link de pagamento" }, { status: 409 });
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
    // Reaproveitar pagamento Cartão pendente existente (evita duplicata em Múltiplas)
    const [existente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Cartão de Crédito' AND status = 'pendente' AND gateway IS NULL
      ORDER BY id LIMIT 1
    `;
    if (existente) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway = 'Mercado Pago Online', valor = ${valorCobranca}
        WHERE id = ${existente.id}
      `;
      pagamentoId = Number(existente.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (
          venda_id, forma, gateway, valor, parcelas, status
        ) VALUES (
          ${vendaId}, 'Cartão de Crédito', 'Mercado Pago Online',
          ${valorCobranca}, 1, 'pendente'
        )
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  }

  // ─── Monta parâmetros da preference ───────────────────────────────────────
  // Proporcional: cada item tem quantity=1 com preço ponderado para o total restante.
  // Isso simplifica quando a venda tem desconto/frete embutido.
  const fatorAjuste = valorCobranca / totalVenda;
  const itemsPreference = itens.map((it) => {
    const preco = Math.round(Number(it.preco_unitario) * fatorAjuste * 100) / 100;
    return {
      title: (it.nome_produto as string).slice(0, 250),
      quantity: Number(it.quantidade),
      unit_price: preco > 0.01 ? preco : 0.01,
    };
  });

  // Ajuste de arredondamento: diferença entre soma dos items e valorCobranca
  const somaItens = itemsPreference.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const diff = Math.round((valorCobranca - somaItens) * 100) / 100;
  if (Math.abs(diff) > 0.01 && itemsPreference.length > 0) {
    // Joga o resto no primeiro item
    const first = itemsPreference[0];
    first.unit_price = Math.round((first.unit_price + diff / first.quantity) * 100) / 100;
  }

  const origin = new URL(req.url).origin;
  const baseUrl = await getWebhookBaseUrl(origin);
  const notificationUrl = `${baseUrl}/api/webhooks/mercado-pago`;
  const token = venda.token_compartilhamento;
  const backUrls = {
    success: `${baseUrl}/pagamento/${token}/sucesso`,
    pending: `${baseUrl}/pagamento/${token}/pendente`,
    failure: `${baseUrl}/pagamento/${token}/erro`,
  };

  // ─── Cria Preference na MP ────────────────────────────────────────────────
  let preference;
  try {
    preference = await createPreference({
      vendaId,
      pagamentoId,
      numeroVenda: String(venda.numero_venda),
      items: itemsPreference,
      payer: venda.cliente_nome
        ? {
            name: String(venda.cliente_nome),
            email: venda.cliente_email ? String(venda.cliente_email) : undefined,
            cpf: venda.cliente_cpf_cnpj ? String(venda.cliente_cpf_cnpj).replace(/\D/g, "") : undefined,
          }
        : undefined,
      notificationUrl,
      backUrls,
      installments: body.installments && body.installments >= 1 ? Math.round(body.installments) : undefined,
    });
  } catch (err: unknown) {
    const internalMsg = err instanceof Error ? err.message : "Erro ao criar preference MP";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: internalMsg, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return internalError("[POST /api/vendas/[id]/mercado-pago/criar-link] createPreference", err, "Erro ao criar preference MP", 502);
  }

  // ─── Persiste preference_id no pagamento ──────────────────────────────────
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      gateway_id      = ${String(preference.id ?? "")},
      gateway_payload = ${JSON.stringify({
        tipo: "preference",
        preference_id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    preference_id: preference.id,
    init_point: preference.init_point,
    sandbox_init_point: preference.sandbox_init_point,
    valor: valorCobranca,
  });
}
