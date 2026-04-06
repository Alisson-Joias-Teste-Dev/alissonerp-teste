import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── PATCH /api/vendas/[id]/itens/[itemId] ─────────────────────────────────────
// Atualiza item (trigger recalcula totais da venda automaticamente)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, itemId } = await params;
  const vendaId = Number(id);
  const iId     = Number(itemId);
  if (isNaN(vendaId) || isNaN(iId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  const [item] = await sql`
    SELECT id FROM alissonerp.itens_venda_erp WHERE id = ${iId} AND venda_id = ${vendaId}
  `;
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const body = await req.json() as {
    quantidade?:    number;
    preco_lista?:   number;
    pct_desconto?:  number;
    preco_unitario?: number;
    total_item?:    number;
    pct_comissao?:  number;
    valor_comissao?: number;
    observacao?:    string | null;
  };

  await sql`
    UPDATE alissonerp.itens_venda_erp SET
      quantidade     = COALESCE(${body.quantidade     ?? null}, quantidade),
      preco_lista    = COALESCE(${body.preco_lista    ?? null}, preco_lista),
      pct_desconto   = COALESCE(${body.pct_desconto   ?? null}, pct_desconto),
      preco_unitario = COALESCE(${body.preco_unitario ?? null}, preco_unitario),
      total_item     = COALESCE(${body.total_item     ?? null}, total_item),
      pct_comissao   = COALESCE(${body.pct_comissao   ?? null}, pct_comissao),
      valor_comissao = COALESCE(${body.valor_comissao ?? null}, valor_comissao),
      observacao     = COALESCE(${body.observacao     ?? null}, observacao)
    WHERE id = ${iId}
  `;

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/vendas/[id]/itens/[itemId] ────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, itemId } = await params;
  const vendaId = Number(id);
  const iId     = Number(itemId);
  if (isNaN(vendaId) || isNaN(iId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, bloqueado, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (venda.situacao === "cancelado") return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });

  await sql`
    DELETE FROM alissonerp.itens_venda_erp
    WHERE id = ${iId} AND venda_id = ${vendaId}
  `;

  return NextResponse.json({ ok: true });
}
