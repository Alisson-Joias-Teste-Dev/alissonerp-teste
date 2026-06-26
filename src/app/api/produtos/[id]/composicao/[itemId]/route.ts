/**
 * PATCH  /api/produtos/[id]/composicao/[itemId] — editar item do BOM
 * DELETE /api/produtos/[id]/composicao/[itemId] — remover item do BOM
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { zodError } from "@/lib/schemas/common";

const ComposicaoItemPatchSchema = z.object({
  quantidade: z.coerce.number().optional(),
  tamanho: z.coerce.number().nullable().optional(),
  unidade_tamanho: z.string().optional(),
  preco_compra_usd: z.coerce.number().nullable().optional(),
  obrigatorio: z.boolean().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

async function authorize(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes, user: null };
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), user: null };
  }
  return { error: null, user };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const produtoId = Number(id);
  const bomItemId = Number(itemId);
  if (!produtoId || !bomItemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { error } = await authorize(req);
  if (error) return error;

  const raw = await req.json().catch(() => ({}));
  const parsed = ComposicaoItemPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { quantidade, tamanho, unidade_tamanho, preco_compra_usd, obrigatorio, observacao } = parsed.data;

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const produtoId = Number(id);
  const bomItemId = Number(itemId);
  if (!produtoId || !bomItemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { error } = await authorize(req);
  if (error) return error;

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
