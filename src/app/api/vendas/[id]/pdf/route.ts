import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { gerarPDFOrcamento } from "@/lib/gerar-pdf-orcamento";
import type { OrcamentoPDF } from "@/lib/gerar-pdf-orcamento";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// ─── GET /api/vendas/[id]/pdf ─────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Geracao de PDF eh I/O + CPU pesado (jsPDF carrega fontes/imagens em memoria).
  // 5/min por user eh generoso pro caso real (vendedor imprime pedido apos fechar).
  try {
    rateLimit(`vendas-pdf:${user.id}`, 5, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PDF = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "consultora"];
  if (!usuario || !ROLES_PDF.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Onda 1D: bloqueia consultora de gerar PDF de venda alheia
  try {
    await requireVendaOwnership({ id: user.id, role: usuario.role, email: user.email ?? "" }, vendaId);
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

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

  // Buscar ficha técnica do orçamento vinculado (se existir)
  let fichaTecnica = undefined;
  let fichaTecnica2 = undefined;
  const [orcLink] = await sql`
    SELECT o.ficha_tecnica_id, o.ficha_tecnica_2_id, o.foto_3d
    FROM alissonerp.orcamentos o
    WHERE o.venda_gerada_id = ${vendaId}
    LIMIT 1
  `;
  if (orcLink?.ficha_tecnica_id) {
    const [ft] = await sql`SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${orcLink.ficha_tecnica_id}`;
    if (ft) fichaTecnica = {
      modelo: ft.modelo, aro_numeracao: ft.aro_numeracao,
      largura: ft.largura ? Number(ft.largura) : undefined,
      espessura: ft.espessura ? Number(ft.espessura) : undefined,
      peso_estimado: ft.peso_estimado ? Number(ft.peso_estimado) : undefined,
      cor_metal: ft.cor_metal, perfil: ft.perfil,
      texto: ft.texto, tipo_fonte: ft.tipo_fonte,
      qtd_pedras: ft.qtd_pedras ? Number(ft.qtd_pedras) : undefined,
      tamanho_pedra: ft.tamanho_pedra ? Number(ft.tamanho_pedra) : undefined,
      tipo_aplicacao_pedra: ft.tipo_aplicacao_pedra,
      has_friso: !!ft.has_friso, friso_kind: ft.friso_kind ?? "friso", friso_tipo: ft.friso_tipo,
      friso_largura: ft.friso_largura ? Number(ft.friso_largura) : undefined,
      friso_profundidade: ft.friso_profundidade ? Number(ft.friso_profundidade) : undefined,
      friso_offset: ft.friso_offset ? Number(ft.friso_offset) : undefined,
      friso_lado: ft.friso_lado,
    };
  }
  if (orcLink?.ficha_tecnica_2_id) {
    const [ft2] = await sql`SELECT * FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${orcLink.ficha_tecnica_2_id}`;
    if (ft2) fichaTecnica2 = {
      modelo: ft2.modelo, aro_numeracao: ft2.aro_numeracao,
      largura: ft2.largura ? Number(ft2.largura) : undefined,
      espessura: ft2.espessura ? Number(ft2.espessura) : undefined,
      peso_estimado: ft2.peso_estimado ? Number(ft2.peso_estimado) : undefined,
      cor_metal: ft2.cor_metal, perfil: ft2.perfil,
      texto: ft2.texto, tipo_fonte: ft2.tipo_fonte,
      qtd_pedras: ft2.qtd_pedras ? Number(ft2.qtd_pedras) : undefined,
      tamanho_pedra: ft2.tamanho_pedra ? Number(ft2.tamanho_pedra) : undefined,
      tipo_aplicacao_pedra: ft2.tipo_aplicacao_pedra,
      has_friso: !!ft2.has_friso, friso_tipo: ft2.friso_tipo,
      friso_largura: ft2.friso_largura ? Number(ft2.friso_largura) : undefined,
      friso_profundidade: ft2.friso_profundidade ? Number(ft2.friso_profundidade) : undefined,
      friso_offset: ft2.friso_offset ? Number(ft2.friso_offset) : undefined,
      friso_lado: ft2.friso_lado,
    };
  }

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
    ficha_tecnica: fichaTecnica,
    ficha_tecnica_2: fichaTecnica2,
    foto_3d: orcLink?.foto_3d ?? undefined,
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
