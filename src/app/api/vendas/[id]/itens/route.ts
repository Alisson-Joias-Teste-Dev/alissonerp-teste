import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/[id]/itens ────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const itens = await sql`
    SELECT
      id, venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista, pct_desconto, preco_unitario,
      total_item, pct_comissao, valor_comissao,
      desconto_autorizado_por, observacao, peso_estimado, created_at
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json(
    itens.map((i) => ({
      ...i,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      pct_desconto:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
      pct_comissao:   Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
    }))
  );
}

// ─── POST /api/vendas/[id]/itens ───────────────────────────────────────────────
// Adiciona item à venda (trigger recalcula totais automaticamente)
// Body: { produto_id, nome_produto, sku?, quantidade, preco_lista,
//         pct_desconto, preco_unitario, total_item, pct_comissao,
//         valor_comissao, peso_estimado?, observacao? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });
  }

  const body = await req.json() as {
    produto_id:    number;
    nome_produto:  string;
    sku?:          string | null;
    quantidade:    number;
    preco_lista:   number;
    pct_desconto:  number;
    preco_unitario: number;
    total_item:    number;
    pct_comissao:  number;
    valor_comissao: number;
    peso_estimado?: number | null;
    observacao?:   string | null;
  };

  if (!body.produto_id || !body.nome_produto) {
    return NextResponse.json({ error: "produto_id e nome_produto obrigatórios" }, { status: 400 });
  }
  if (!body.quantidade || body.quantidade < 1) {
    return NextResponse.json({ error: "Quantidade inválida" }, { status: 400 });
  }
  if (body.preco_lista == null || body.preco_unitario == null || body.total_item == null) {
    return NextResponse.json({ error: "Preços obrigatórios" }, { status: 400 });
  }

  const [novoItem] = await sql`
    INSERT INTO alissonerp.itens_venda_erp (
      venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista,
      pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao,
      peso_estimado, observacao
    ) VALUES (
      ${vendaId},
      ${body.produto_id},
      ${body.nome_produto},
      ${body.sku ?? null},
      ${body.quantidade},
      ${body.preco_lista},
      ${body.pct_desconto ?? 0},
      ${body.preco_unitario},
      ${body.total_item},
      ${body.pct_comissao ?? 0},
      ${body.valor_comissao ?? 0},
      ${body.peso_estimado ?? null},
      ${body.observacao ?? null}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: novoItem.id }, { status: 201 });
}
