import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/orcamento/[token]
// Rota PÚBLICA — retorna dados do orçamento para exibição/impressão
// Não expõe: vendedor, comissões, obs internas, video, CPF completo
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [venda] = await sql`
    SELECT
      v.id,
      v.numero_venda,
      v.cliente_id,
      c.nome        AS cliente_nome,
      c.email       AS cliente_email,
      c.telefone    AS cliente_telefone,
      v.data_venda,
      v.data_entrega,
      v.total_produtos,
      v.total_desconto,
      v.total_frete,
      v.total_venda,
      v.situacao,
      v.forma_envio,
      v.observacoes
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE v.token_compartilhamento = ${token}::uuid
      AND v.situacao != 'cancelado'
  `;

  if (!venda) return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });

  const itens = await sql`
    SELECT
      nome_produto, sku, quantidade,
      preco_lista, pct_desconto, preco_unitario, total_item,
      observacao
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${venda.id}
    ORDER BY id
  `;

  return NextResponse.json({
    ...venda,
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete:    Number(venda.total_frete),
    total_venda:    Number(venda.total_venda),
    itens: itens.map(i => ({
      ...i,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      pct_desconto:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
    })),
  });
}
