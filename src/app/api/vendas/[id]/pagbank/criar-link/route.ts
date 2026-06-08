/**
 * POST /api/vendas/[id]/pagbank/criar-link
 *
 * Cria um Checkout PagBank (link de pagamento) para cartão de crédito.
 * Usa POST /checkouts, que gera uma página de pagamento pública no PagBank.
 * O cliente acessa o checkout_url e paga com cartão.
 *
 * Fluxo:
 *   1. Autentica e verifica permissão do usuário
 *   2. Carrega venda + itens
 *   3. Calcula valor da cobrança (total_venda - soma_confirmados)
 *   4. Upsert pagamentos_venda (aproveita existente ou cria novo)
 *   5. Cria pedido via PagBank Orders API com charge CREDIT_CARD
 *   6. Salva gateway_id no pagamento
 *   7. Retorna payment_url para o frontend
 *
 * Gateway: "PagBank Online"
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { criarCheckoutPagamento, getPagBankWebhookBaseUrl, sanitizarNomeCliente } from "@/lib/pagbank";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CriarLinkSchema = z.object({
  pagamento_id: z.coerce.number().int().positive().optional(),
  valor: z.coerce.number().optional(),
  installments: z.coerce.number().int().optional(),
}).passthrough();

const ROLES_PERMITIDOS = [
  "desenvolvedor",
  "admin",
  "gerente_fabrica",
  "gerente_loja",
  "consultora",
];

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

  // Carrega venda + cliente + itens
  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda, v.situacao, v.bloqueado,
      v.total_venda, v.total_produtos, v.total_desconto, v.total_frete,
      v.cliente_id, v.vendedor_id,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.email AS cliente_email
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (!["rascunho", "aprovado"].includes(venda.situacao)) {
    return NextResponse.json(
      { error: `Venda em situação '${venda.situacao}' não aceita cobrança PagBank` },
      { status: 409 },
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

  // Calcula valor do pagamento PagBank
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
    return NextResponse.json(
      { error: "Venda já está totalmente paga — não é possível gerar novo link de pagamento" },
      { status: 409 },
    );
  }

  const valorCobranca = body.valor != null ? Math.min(Number(body.valor), restante) : restante;

  if (!valorCobranca || valorCobranca <= 0) {
    return NextResponse.json({ error: "Valor da cobrança deve ser > 0" }, { status: 400 });
  }

  // Upsert pagamentos_venda
  let pagamentoId: number;
  if (body.pagamento_id) {
    const [pag] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE id = ${body.pagamento_id} AND venda_id = ${vendaId}
    `;
    if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    pagamentoId = Number(pag.id);
  } else {
    // Reaproveitar pagamento Cartão pendente existente (evita duplicata)
    const [existente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Cartão de Crédito' AND status = 'pendente' AND gateway IS NULL
      ORDER BY id LIMIT 1
    `;
    if (existente) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway = 'PagBank Online', valor = ${valorCobranca}
        WHERE id = ${existente.id}
      `;
      pagamentoId = Number(existente.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (
          venda_id, forma, gateway, valor, parcelas, status
        ) VALUES (
          ${vendaId}, 'Cartão de Crédito', 'PagBank Online',
          ${valorCobranca}, 1, 'pendente'
        )
        RETURNING id
      `;
      pagamentoId = Number(pag.id);
    }
  }

  // Monta itens do pedido (proporcionais ao valor da cobrança)
  const fatorAjuste = valorCobranca / totalVenda;
  const itemsPagBank = itens.map((it, i) => {
    const precoEmReais = Math.round(Number(it.preco_unitario) * fatorAjuste * 100) / 100;
    const precoCentavos = Math.round(precoEmReais * 100);
    return {
      reference_id: String(i + 1),
      name: (it.nome_produto as string).slice(0, 250),
      quantity: Number(it.quantidade),
      unit_amount: precoCentavos > 0 ? precoCentavos : 1, // mínimo 1 centavo
    };
  });

  // Ajuste de arredondamento
  const somaItensReais = itemsPagBank.reduce((s, i) => s + i.quantity * (i.unit_amount / 100), 0);
  const diff = Math.round((valorCobranca - somaItensReais) * 100) / 100;
  if (Math.abs(diff) > 0.01 && itemsPagBank.length > 0) {
    const first = itemsPagBank[0];
    first.unit_amount = Math.round((first.unit_amount + diff * 100 / first.quantity));
  }

  const origin = new URL(req.url).origin;
  const baseUrl = await getPagBankWebhookBaseUrl(origin);
  const notificationUrl = `${baseUrl}/api/webhooks/pagbank`;

  // Cria checkout no PagBank
  let pedido;
  try {
    pedido = await criarCheckoutPagamento({
      vendaId,
      pagamentoId,
      numeroVenda: String(venda.numero_venda),
      valor: valorCobranca,
      items: itemsPagBank,
      customer: {
        name: sanitizarNomeCliente(venda.cliente_nome ? String(venda.cliente_nome) : "Cliente"),
        email: "pagbank@alissonjoias.com.br",
        tax_id: venda.cliente_cpf_cnpj ? String(venda.cliente_cpf_cnpj).replace(/\D/g, "") : undefined,
      },
      notificationUrl,
      installments: body.installments && body.installments >= 1 ? Math.round(body.installments) : undefined,
    });
  } catch (err: unknown) {
    const internalMsg = err instanceof Error ? err.message : "Erro ao criar checkout PagBank";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: internalMsg, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return internalError(
      "[POST /api/vendas/[id]/pagbank/criar-link] criarCheckoutPagamento",
      err,
      "Erro ao criar checkout PagBank",
      502,
    );
  }

  // Persiste checkout_id no pagamento
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      gateway_id      = ${pedido.checkout_id},
      gateway_payload = ${JSON.stringify({
        tipo: "checkout",
        checkout_id: pedido.checkout_id,
        checkout_url: pedido.checkout_url,
        status: pedido.status,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    checkout_id: pedido.checkout_id,
    payment_url: pedido.checkout_url,
    valor: valorCobranca,
  });
}
