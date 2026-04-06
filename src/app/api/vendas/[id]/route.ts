import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/[id] ──────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda,
      v.cliente_id, v.cliente_nome, v.cliente_cpf_cnpj, v.cliente_email, v.cliente_telefone,
      v.vendedor_id, v.vendedor_nome,
      v.data_venda, v.data_entrega,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda, v.total_comissao,
      v.situacao, v.forma_envio, v.forma_frete,
      v.observacoes, v.observacoes_internas, v.video_obs_interna,
      v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_at, v.tiny_sync_erro,
      v.bloqueado, v.created_by, v.created_at, v.updated_at,
      v.qtd_itens, v.total_pago
    FROM alissonerp.vw_vendas_erp_completa v
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT
      id, produto_id, nome_produto, sku,
      quantidade,
      preco_lista, pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao,
      desconto_autorizado_por, observacao, peso_estimado, created_at
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const pagamentos = await sql`
    SELECT
      id, forma, gateway, valor, parcelas,
      status, gateway_id, data_confirmacao, created_at
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json({
    ...venda,
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete:    Number(venda.total_frete),
    total_venda:    Number(venda.total_venda),
    total_comissao: Number(venda.total_comissao),
    total_pago:     Number(venda.total_pago),
    qtd_itens:      Number(venda.qtd_itens),
    itens: itens.map((i) => ({
      ...i,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      pct_desconto:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
      pct_comissao:   Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
    })),
    pagamentos: pagamentos.map((p) => ({
      ...p,
      valor: Number(p.valor),
    })),
  });
}

// ─── PATCH /api/vendas/[id] ────────────────────────────────────────────────────
// Campos editáveis: situacao, data_entrega, total_frete, forma_envio, forma_frete,
//                   observacoes, observacoes_internas
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, situacao, bloqueado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  const body = await req.json() as {
    situacao?:             string;
    data_entrega?:         string | null;
    total_frete?:          number;
    forma_envio?:          string | null;
    forma_frete?:          string | null;
    observacoes?:          string | null;
    observacoes_internas?: string | null;
  };

  const SITUACOES_VALIDAS = ["rascunho", "aprovado", "enviado", "cancelado", "concluido"];
  if (body.situacao && !SITUACOES_VALIDAS.includes(body.situacao)) {
    return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
  }

  await sql`
    UPDATE alissonerp.vendas_erp SET
      situacao             = COALESCE(${body.situacao ?? null},             situacao),
      data_entrega         = COALESCE(${body.data_entrega ?? null},         data_entrega),
      total_frete          = COALESCE(${body.total_frete ?? null},          total_frete),
      forma_envio          = COALESCE(${body.forma_envio ?? null},          forma_envio),
      forma_frete          = COALESCE(${body.forma_frete ?? null},          forma_frete),
      observacoes          = COALESCE(${body.observacoes ?? null},          observacoes),
      observacoes_internas = COALESCE(${body.observacoes_internas ?? null}, observacoes_internas)
    WHERE id = ${vendaId}
  `;

  // Recalcular total_venda se frete mudou
  if (body.total_frete !== undefined) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET total_venda = total_produtos - total_desconto + ${body.total_frete}
      WHERE id = ${vendaId}
    `;
  }

  // Auto-baixa estoque comercial removida — trigger 111 (trg_estoque_comercial_baixa_venda) já cuida disso.

  return NextResponse.json({ ok: true });
}
