import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/orcamento/compartilhado?token=UUID
// Rota PÚBLICA — retorna dados completos da venda para exibição/impressão
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  // Rota PÚBLICA — qualquer um com o token vê os campos abaixo. NÃO incluir
  // observacoes_internas, total_comissao, pct_comissao nem valor_comissao:
  // expõe margem, anotações de loja, fornecedor e comissão do vendedor.
  //
  // EXPIRAÇÃO: token vale 7 dias após a venda ser criada. Antes era permanente
  // — quem pegava o link via WhatsApp/email tinha acesso pra sempre, mesmo
  // depois do cliente fechar/desistir. 7 dias cobre o ciclo típico do
  // orçamento; se precisar reenviar, vendedor gera link novo.
  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda, v.cliente_id,
      c.nome AS cliente_nome, c.email AS cliente_email,
      c.telefone AS cliente_telefone, c.celular AS cliente_celular,
      c.cpf_cnpj AS cliente_cpf_cnpj,
      c.endereco AS cliente_endereco, c.numero AS cliente_numero,
      c.complemento AS cliente_complemento, c.bairro AS cliente_bairro,
      c.municipio AS cliente_municipio, c.cep AS cliente_cep, c.uf AS cliente_uf,
      vd.nome AS vendedor_nome,
      v.data_venda, v.data_entrega, v.created_at,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda,
      v.situacao, v.forma_envio, v.forma_frete, v.observacoes,
      v.endereco_entrega, v.endereco_entrega_numero, v.endereco_entrega_complemento,
      v.endereco_entrega_bairro, v.endereco_entrega_cidade,
      v.endereco_entrega_cep, v.endereco_entrega_uf,
      (v.created_at < NOW() - INTERVAL '7 days') AS expirado
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.token_compartilhamento = ${token}::uuid
      AND v.situacao != 'cancelado'
  `;

  if (!venda) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (venda.expirado) {
    return NextResponse.json({ error: "Link expirado (válido por 7 dias). Solicite um novo ao vendedor." }, { status: 410 });
  }

  // Idem: itens públicos sem pct_comissao/valor_comissao.
  // Bug #40: expõe foto_3d do orçamento de origem (quando a venda veio de
  // orçamento de aliança/peça). Antes a tela pública mostrava "Sem foto"
  // hardcoded mesmo tendo a screenshot 3D salva no orçamento.
  const itens = await sql`
    SELECT nome_produto, sku, quantidade, peso_estimado,
           preco_lista, pct_desconto, preco_unitario, total_item,
           observacao
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${venda.id}
    ORDER BY id
  `;
  const [orcamentoOrigem] = await sql`
    SELECT foto_3d FROM alissonerp.orcamentos
    WHERE venda_gerada_id = ${venda.id}
    LIMIT 1
  `;
  const foto3d = orcamentoOrigem?.foto_3d ?? null;

  const pagamentos = await sql`
    SELECT forma, gateway, valor, parcelas, status
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${venda.id}
    ORDER BY id
  `;

  return NextResponse.json({
    ...venda,
    foto_3d: foto3d,
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete: Number(venda.total_frete),
    total_venda: Number(venda.total_venda),
    itens: itens.map(i => ({
      ...i,
      quantidade: Number(i.quantidade),
      preco_lista: Number(i.preco_lista),
      pct_desconto: Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item: Number(i.total_item),
      peso_estimado: i.peso_estimado != null ? Number(i.peso_estimado) : null,
    })),
    pagamentos: pagamentos.map(p => ({
      ...p,
      valor: Number(p.valor),
      parcelas: Number(p.parcelas),
    })),
  });
}
