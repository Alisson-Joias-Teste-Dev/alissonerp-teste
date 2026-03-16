/**
 * PATCH  /api/produtos/[id]/composicao/[itemId] — editar item do BOM
 * DELETE /api/produtos/[id]/composicao/[itemId] — remover item do BOM
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";

async function authorize() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado", status: 401, user: null };

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) return { error: "Sem permissão", status: 403, user: null };

  return { error: null, status: 200, user };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const produtoId = Number(id);
  const bomItemId = Number(itemId);
  if (!produtoId || !bomItemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { error, status } = await authorize();
  if (error) return NextResponse.json({ error }, { status });

  const body = await req.json();
  const { quantidade, tamanho, unidade_tamanho, preco_compra_usd, obrigatorio, observacao } = body;

  if (quantidade !== undefined && Number(quantidade) <= 0) {
    return NextResponse.json({ error: "quantidade deve ser maior que zero" }, { status: 400 });
  }

  try {
    const [item] = await sql`
      UPDATE alissonerp.produto_composicao
      SET
        quantidade       = COALESCE(${quantidade != null ? Number(quantidade) : null}, quantidade),
        tamanho          = CASE WHEN ${tamanho !== undefined} THEN ${tamanho != null ? Number(tamanho) : null} ELSE tamanho END,
        unidade_tamanho  = COALESCE(${unidade_tamanho ?? null}, unidade_tamanho),
        preco_compra_usd = CASE WHEN ${preco_compra_usd !== undefined} THEN ${preco_compra_usd != null ? Number(preco_compra_usd) : null} ELSE preco_compra_usd END,
        obrigatorio      = COALESCE(${obrigatorio ?? null}, obrigatorio),
        observacao       = CASE WHEN ${observacao !== undefined} THEN ${observacao ?? null} ELSE observacao END,
        updated_at       = NOW()
      WHERE id = ${bomItemId} AND produto_id = ${produtoId}
      RETURNING *
    `;

    if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

    const totalPedras = await recalcularPrecoPedras(produtoId);
    return NextResponse.json({ item, totalPedras });
  } catch (err) {
    console.error("[PATCH /api/produtos/[id]/composicao/[itemId]]", err);
    return NextResponse.json({ error: "Erro ao atualizar item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const produtoId = Number(id);
  const bomItemId = Number(itemId);
  if (!produtoId || !bomItemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { error, status } = await authorize();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const [deleted] = await sql`
      DELETE FROM alissonerp.produto_composicao
      WHERE id = ${bomItemId} AND produto_id = ${produtoId}
      RETURNING id, tipo
    `;

    if (!deleted) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

    const totalPedras = await recalcularPrecoPedras(produtoId);
    return NextResponse.json({ deleted: true, totalPedras });
  } catch (err) {
    console.error("[DELETE /api/produtos/[id]/composicao/[itemId]]", err);
    return NextResponse.json({ error: "Erro ao remover item" }, { status: 500 });
  }
}
