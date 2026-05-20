import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";
import { zodError } from "@/lib/schemas/common";
import { isFullAccess } from "@/lib/roles";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";

const ItemVendaPatchSchema = z.object({
  quantidade: z.coerce.number().optional(),
  preco_lista: z.coerce.number().optional(),
  pct_desconto: z.coerce.number().optional(),
  preco_unitario: z.coerce.number().optional(),
  total_item: z.coerce.number().optional(),
  pct_comissao: z.coerce.number().optional(),
  valor_comissao: z.coerce.number().optional(),
  observacao: z.string().nullable().optional(),
}).passthrough();

async function checkOwnership(userId: string, vendaId: number): Promise<{ role: string; mxDesconto: number }> {
  const [u] = await sql<{ role: string; mx_desconto_permitido: number | null }[]>`
    SELECT role, mx_desconto_permitido FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
  return { role: u.role, mxDesconto: Number(u.mx_desconto_permitido ?? 0) };
}

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
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda já aprovada. Não é possível alterar itens." }, { status: 409 });
  }

  // Onda 1D: consultora so edita item de venda propria
  let userRole: string;
  let userMxDesconto: number;
  try {
    const own = await checkOwnership(user.id, vendaId);
    userRole = own.role;
    userMxDesconto = own.mxDesconto;
  }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [item] = await sql`
    SELECT id FROM alissonerp.itens_venda_erp WHERE id = ${iId} AND venda_id = ${vendaId}
  `;
  if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = ItemVendaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // ── Gate de desconto (v2.60.4): bloqueia vendedora/gerente de ultrapassar
  // mx_desconto_permitido ao EDITAR item. Espelha regra do POST e do orçamento.
  if (body.pct_desconto !== undefined && !isFullAccess(userRole)) {
    const descNovo = Number(body.pct_desconto);
    if (Number.isFinite(descNovo) && descNovo > userMxDesconto) {
      return NextResponse.json(
        {
          error: `Desconto ${descNovo}% excede seu limite (${userMxDesconto}%). Solicite aprovação.`,
          solicitar: true,
        },
        { status: 403 },
      );
    }
  }

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

  // Se desconto foi alterado numa venda em rascunho, invalida aprovação anterior
  if (body.pct_desconto !== undefined && venda.situacao === "rascunho") {
    const thresholdItem = await getDescontoThreshold(vendaId);
    const [vendaAtual] = await sql`
      SELECT desconto_aprovado_por,
        EXISTS(
          SELECT 1 FROM alissonerp.itens_venda_erp
          WHERE venda_id = ${vendaId} AND pct_desconto > ${thresholdItem}
        ) AS tem_desconto_alto
      FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    if (vendaAtual?.tem_desconto_alto) {
      await sql`
        UPDATE alissonerp.vendas_erp
        SET desconto_aprovado_por = NULL,
            desconto_aprovado_em  = NULL,
            updated_at            = NOW()
        WHERE id = ${vendaId}
      `;
      // Cancela tarefa de desconto pendente, se houver
      await sql`
        UPDATE alissonerp.tarefas
        SET status = 'cancelado', updated_at = NOW()
        WHERE venda_id = ${vendaId}
          AND status = 'aguardando_aprovacao'
          AND tags @> ARRAY['aprovacao_desconto']::text[]
      `.catch(() => {});
    }
  }

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
  if (venda.situacao !== "rascunho") {
    return NextResponse.json({ error: "Venda já aprovada. Não é possível remover itens." }, { status: 409 });
  }

  // Onda 1D: consultora so deleta item de venda propria
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await sql`
    DELETE FROM alissonerp.itens_venda_erp
    WHERE id = ${iId} AND venda_id = ${vendaId}
  `;

  return NextResponse.json({ ok: true });
}
