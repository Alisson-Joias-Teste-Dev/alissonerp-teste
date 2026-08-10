/**
 * POST /api/vendas/[id]/pagbank/criar-pix
 *
 * Cria uma cobrança PIX via PagBank Orders API e retorna o QR Code
 * (EMV string + PNG base64) para o cliente escanear em qualquer app bancário.
 *
 * Fluxo:
 *   1. Autentica e verifica permissão
 *   2. Carrega venda + cliente + itens
 *   3. Calcula valor da cobrança (total_venda - soma_confirmados)
 *   4. Upsert pagamentos_venda (aproveita Pix pendente ou cria novo)
 *   5. Cria pedido PagBank com charge.type=PIX e qr_codes
 *   6. Busca imagem base64 do QR code via endpoint PagBank
 *   7. Salva gateway_id, QR code data no pagamento
 *   8. Retorna qr_code (EMV), qr_code_base64, order_id
 *
 * Gateway: "PagBank Pix"
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { criarPedidoPagamento, buscarQrCodeBase64, getPagBankWebhookBaseUrl, sanitizarNomeCliente } from "@/lib/pagbank";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const CriarPixSchema = z.object({
  pagamento_id: z.coerce.number().int().positive().optional(),
  valor: z.coerce.number().optional(),
  expira_em_minutos: z.coerce.number().int().positive().optional(),
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
      v.id, v.numero_venda, v.status AS situacao, v.bloqueado,
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
      { error: `Venda em situação '${venda.situacao}' não aceita cobrança PIX` },
      { status: 409 },
    );
  }

  // Consultora só pode gerar PIX pra próprias vendas
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
  const parsed = CriarPixSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Calcula valor do pagamento PIX
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
      { error: "Venda já está totalmente paga — não é possível gerar novo PIX" },
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
    // Reaproveitar pagamento Pix pendente existente
    const [existente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Pix' AND status = 'pendente' AND gateway IS NULL
      ORDER BY id LIMIT 1
    `;
    if (existente) {
      await sql`
        UPDATE alissonerp.pagamentos_venda
        SET gateway = 'PagBank Pix', valor = ${valorCobranca}
        WHERE id = ${existente.id}
      `;
      pagamentoId = Number(existente.id);
    } else {
      const [pag] = await sql`
        INSERT INTO alissonerp.pagamentos_venda (
          venda_id, forma, gateway, valor, parcelas, status
        ) VALUES (
          ${vendaId}, 'Pix', 'PagBank Pix',
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
      unit_amount: precoCentavos > 0 ? precoCentavos : 1,
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

  // Cria pedido PIX no PagBank
  let pedido;
  try {
    pedido = await criarPedidoPagamento({
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
      tipo: "PIX",
      expiraEmMinutos: body.expira_em_minutos ?? 30,
    });
  } catch (err: unknown) {
    const internalMsg = err instanceof Error ? err.message : "Erro ao criar PIX PagBank";
    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET gateway_payload = ${JSON.stringify({ erro: internalMsg, quando: new Date().toISOString() })}::text::jsonb
      WHERE id = ${pagamentoId}
    `;
    return internalError(
      "[POST /api/vendas/[id]/pagbank/criar-pix] criarPedidoPagamento",
      err,
      "Erro ao criar PIX PagBank",
      502,
    );
  }

  // Busca imagem base64 do QR code via endpoint PagBank (qr_codes[0].id = QRCO_*)
  let qrCodeBase64 = "";
  if (pedido.qr_code_id) {
    try {
      qrCodeBase64 = await buscarQrCodeBase64(pedido.qr_code_id);
    } catch (err) {
      console.error("[pagbank/criar-pix] Erro ao buscar QR code base64:", err);
    }
  }

  // Persiste dados no pagamento
  await sql`
    UPDATE alissonerp.pagamentos_venda
    SET
      gateway_id      = ${pedido.order_id},
      gateway_payload = ${JSON.stringify({
        tipo: "order_pix",
        order_id: pedido.order_id,
        qr_code_id: pedido.qr_code_id,
        status: pedido.status,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
        expira_em: new Date(Date.now() + (body.expira_em_minutos ?? 30) * 60 * 1000).toISOString(),
      })}::text::jsonb
    WHERE id = ${pagamentoId}
  `;

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    order_id: pedido.order_id,
    qr_code: pedido.qr_code,
    qr_code_base64: qrCodeBase64,
    valor: valorCobranca,
    /** Tempo de expiração em minutos */
    expira_em_minutos: body.expira_em_minutos ?? 30,
  });
}
