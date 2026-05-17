import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { atualizarDevolucao, cancelarDevolucao, type PatchDevolucao } from "@/lib/devolucoes";
import { internalError } from "@/lib/api-error";
import { zodError, PercentSchema } from "@/lib/schemas/common";

const DevolucaoPatchSchema = z.object({
  motivo: z.string().max(5000).nullable().optional(),
  tipo: z.enum(["parcial", "total"]).optional(),
  tipo_compensacao: z.string().max(50).optional(),
  foi_entregue: z.boolean().optional(),
  percentual_retencao: PercentSchema.optional(),
}).partial();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// ─── GET /api/devolucoes/[id] ────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const devId = Number(id);
  if (isNaN(devId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [dev] = await sql`
    SELECT d.*, v.numero_venda, v.cliente_id AS venda_cliente_id,
           c.nome AS cliente_nome
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    LEFT JOIN public.contatos c  ON c.id_contato = v.cliente_id
    WHERE d.id = ${devId}
  `;
  if (!dev) return NextResponse.json({ error: "Nao encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT di.*, iv.nome_produto, iv.sku
    FROM alissonerp.devolucoes_itens di
    JOIN alissonerp.itens_venda_erp iv ON iv.id = di.item_venda_id
    WHERE di.devolucao_id = ${devId}
    ORDER BY di.id
  `;

  const vales = await sql`
    SELECT id, numero, valor_original, valor_disponivel, status,
           venda_utilizado_id, utilizado_em, vale_origem_id, created_at
    FROM alissonerp.vale_troca
    WHERE devolucao_id = ${devId}
    ORDER BY id
  `;

  const reembolsos = await sql`
    SELECT id, metodo, valor, mp_payment_id, mp_refund_id, mp_status, mp_erro,
           conta_pagar_id, status, processado_em, created_at
    FROM alissonerp.reembolsos
    WHERE devolucao_id = ${devId}
    ORDER BY id
  `;

  return NextResponse.json({
    ...dev,
    valor_total_devolvido: Number(dev.valor_total_devolvido),
    valor_retido: Number(dev.valor_retido),
    valor_compensacao: Number(dev.valor_compensacao),
    percentual_retencao: Number(dev.percentual_retencao),
    itens: itens.map((i) => ({
      ...i,
      quantidade: Number(i.quantidade),
      valor_unitario: Number(i.valor_unitario),
      valor_total: Number(i.valor_total),
    })),
    vales_troca: vales.map((v) => ({
      ...v,
      valor_original: Number(v.valor_original),
      valor_disponivel: Number(v.valor_disponivel),
    })),
    reembolsos: reembolsos.map((r) => ({ ...r, valor: Number(r.valor) })),
  });
}

// ─── PATCH /api/devolucoes/[id] — edita so em rascunho ────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const devId = Number(id);
  if (isNaN(devId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = DevolucaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const patch: PatchDevolucao = {
    motivo: body.motivo,
    tipo: body.tipo,
    tipoCompensacao: body.tipo_compensacao as PatchDevolucao["tipoCompensacao"],
    foiEntregue: body.foi_entregue,
    percentualRetencao: body.percentual_retencao,
  };

  try {
    await atualizarDevolucao(devId, patch, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[PATCH /api/devolucoes/[id]]", err, "Erro ao atualizar devolucao", 400);
  }
}

// ─── DELETE /api/devolucoes/[id] — cancela ─────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const devId = Number(id);
  if (isNaN(devId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  try {
    await cancelarDevolucao(devId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[DELETE /api/devolucoes/[id]]", err, "Erro ao cancelar devolucao", 400);
  }
}
