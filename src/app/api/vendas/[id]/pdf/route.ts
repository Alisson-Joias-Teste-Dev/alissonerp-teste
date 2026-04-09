import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";

// ─── GET /api/vendas/[id]/pdf ─────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PDF = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  if (!usuario || !ROLES_PDF.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT
      v.numero_venda, v.data_venda, v.data_entrega, v.created_at,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda,
      v.forma_envio, v.observacoes,
      v.endereco_entrega, v.endereco_entrega_numero, v.endereco_entrega_complemento,
      v.endereco_entrega_bairro, v.endereco_entrega_cidade, v.endereco_entrega_cep, v.endereco_entrega_uf,
      c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone,
      c.celular AS cliente_celular, c.cpf_cnpj AS cliente_cpf_cnpj,
      c.endereco AS cliente_endereco, c.numero AS cliente_numero, c.complemento AS cliente_complemento,
      c.bairro AS cliente_bairro, c.municipio AS cliente_municipio, c.cep AS cliente_cep, c.uf AS cliente_uf,
      vd.nome AS vendedor_nome
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT nome_produto, sku, quantidade, preco_lista, pct_desconto, preco_unitario, total_item
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;

  const pagamentos = await sql`
    SELECT forma, gateway, valor, parcelas
    FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} ORDER BY id
  `;

  // Montar endereço de entrega (preferir endereço entrega, fallback endereço cliente)
  const endEntrega = venda.endereco_entrega
    ? [venda.endereco_entrega, venda.endereco_entrega_numero ? `nº ${venda.endereco_entrega_numero}` : null,
       venda.endereco_entrega_complemento, venda.endereco_entrega_bairro,
       venda.endereco_entrega_cidade, venda.endereco_entrega_uf,
       venda.endereco_entrega_cep ? `CEP: ${venda.endereco_entrega_cep}` : null].filter(Boolean).join(", ")
    : [venda.cliente_endereco, venda.cliente_numero ? `nº ${venda.cliente_numero}` : null,
       venda.cliente_complemento, venda.cliente_bairro, venda.cliente_municipio, venda.cliente_uf,
       venda.cliente_cep ? `CEP: ${venda.cliente_cep}` : null].filter(Boolean).join(", ") || undefined;

  const dados: OrcamentoPDF = {
    numero_venda:    venda.numero_venda,
    cliente_nome:    venda.cliente_nome ?? "Sem cliente",
    cliente_email:   venda.cliente_email ?? undefined,
    cliente_telefone: venda.cliente_celular ?? venda.cliente_telefone ?? undefined,
    cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? undefined,
    vendedor_nome:   venda.vendedor_nome ?? undefined,
    endereco_entrega: endEntrega,
    data_venda:      venda.data_venda,
    data_entrega:    venda.data_entrega ?? undefined,
    created_at:      venda.created_at ?? undefined,
    total_produtos:  Number(venda.total_produtos),
    total_desconto:  Number(venda.total_desconto),
    total_frete:     Number(venda.total_frete),
    total_venda:     Number(venda.total_venda),
    forma_envio:     venda.forma_envio ?? undefined,
    observacoes:     venda.observacoes ?? undefined,
    itens: itens.map((i) => ({
      nome:           i.nome_produto,
      sku:            i.sku ?? "—",
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      desconto_pct:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total:          Number(i.total_item),
    })),
    pagamentos: pagamentos.map(p => ({
      forma: p.forma,
      gateway: p.gateway ?? null,
      parcelas: Number(p.parcelas),
      valor: Number(p.valor),
    })),
  };

  const doc = gerarPDFOrcamento(dados);
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pedido-${dados.numero_venda}.pdf"`,
    },
  });
}
