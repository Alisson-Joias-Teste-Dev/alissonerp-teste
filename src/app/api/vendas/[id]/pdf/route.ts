import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";

// ─── GET /api/vendas/[id]/pdf ─────────────────────────────────────────────────
// Gera e retorna PDF do orçamento
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

  // Buscar venda
  const [venda] = await sql`
    SELECT
      v.numero_venda, v.cliente_nome, v.cliente_email, v.cliente_telefone, v.cliente_cpf_cnpj,
      v.data_venda, v.data_entrega,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda,
      v.forma_envio, v.observacoes
    FROM alissonerp.vw_vendas_erp_completa v
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Buscar itens
  const itens = await sql`
    SELECT
      nome_produto, sku, quantidade,
      preco_lista, pct_desconto, preco_unitario, total_item
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const dados: OrcamentoPDF = {
    numero_venda:    venda.numero_venda,
    cliente_nome:    venda.cliente_nome ?? "Sem cliente",
    cliente_email:   venda.cliente_email ?? undefined,
    cliente_telefone: venda.cliente_telefone ?? undefined,
    cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? undefined,
    data_venda:      venda.data_venda,
    data_entrega:    venda.data_entrega ?? undefined,
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
  };

  const doc = gerarPDFOrcamento(dados);
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${dados.numero_venda}.pdf"`,
    },
  });
}
