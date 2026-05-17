import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { estornarVenda, concluirVenda } from "@/lib/vendas-aprovar";
import { approveVenda } from "@/lib/vendas-aprovar";
import { ForbiddenError } from "@/lib/auth-server";
import { requireVendaOwnership, NotFoundError } from "@/lib/auth-vendas";

async function checkOwnership(userId: string, vendaId: number) {
  const [u] = await sql<{ role: string }[]>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid LIMIT 1
  `;
  if (!u) throw new ForbiddenError("Usuario nao encontrado");
  await requireVendaOwnership({ id: userId, role: u.role, email: "" }, vendaId);
}

// ─── PATCH /api/vendas/[id]/pagamentos/[pagId] ─────────────────────────────────
// Atualiza status do pagamento (confirmar, cancelar, estornar)
// Body: { status: "confirmado"|"cancelado"|"estornado", data_confirmacao? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pagId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, pagId } = await params;
  const vendaId = Number(id);
  const pId     = Number(pagId);
  if (isNaN(vendaId) || isNaN(pId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [pag] = await sql`
    SELECT p.id, v.bloqueado, v.situacao AS venda_situacao
    FROM alissonerp.pagamentos_venda p
    JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
    WHERE p.id = ${pId} AND p.venda_id = ${vendaId}
  `;
  if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  if (pag.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (pag.venda_situacao === "cancelado") return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });
  if (pag.venda_situacao === "concluido") return NextResponse.json({ error: "Venda concluída não permite alteração de pagamento" }, { status: 409 });

  // Onda 1D: consultora so altera pagamento de venda propria
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json() as {
    status:             string;
    data_confirmacao?:  string | null;
    gateway_id?:        string | null;
  };

  const STATUS_VALIDOS = ["pendente", "confirmado", "cancelado", "estornado"];
  if (!STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  // Força data_confirmacao ao confirmar (evita pagamento fantasma sem timestamp)
  if (body.status === "confirmado") {
    await sql`
      UPDATE alissonerp.pagamentos_venda SET
        status           = 'confirmado',
        data_confirmacao = COALESCE(data_confirmacao, NOW()),
        gateway_id       = COALESCE(${body.gateway_id ?? null}, gateway_id)
      WHERE id = ${pId}
    `;
    // Auto-aprovar + auto-concluir se todos pagamentos confirmados
    try {
      const [pvenda] = await sql`
        SELECT v.situacao, v.aprovacao_credito_tipo
        FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
      `;
      const [pendentes] = await sql`
        SELECT COUNT(*)::int AS cnt FROM alissonerp.pagamentos_venda
        WHERE venda_id = ${vendaId} AND status = 'pendente'
      `;
      const todosPagos = Number(pendentes.cnt) === 0;

      if (pvenda?.situacao === "rascunho" && pvenda?.aprovacao_credito_tipo) {
        const [outrosPend] = await sql`
          SELECT COUNT(*)::int AS cnt FROM alissonerp.pagamentos_venda
          WHERE venda_id = ${vendaId} AND forma != 'A Receber' AND status = 'pendente'
        `;
        if (Number(outrosPend.cnt) === 0) {
          await approveVenda(vendaId, user.id, { tinyBestEffort: true });
        }
      }

      if (todosPagos) {
        const [atual] = await sql`SELECT situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
        if (atual?.situacao === "aprovado") {
          await concluirVenda(vendaId, user.id, { tinyBestEffort: true });
        }
      }
    } catch (e) {
      console.error(`[pagamentos/PATCH] auto-aprovar/concluir venda=${vendaId}:`, e);
    }
  } else {
    await sql`
      UPDATE alissonerp.pagamentos_venda SET
        status           = ${body.status},
        data_confirmacao = COALESCE(${body.data_confirmacao ?? null}::timestamptz, data_confirmacao),
        gateway_id       = COALESCE(${body.gateway_id      ?? null},              gateway_id)
      WHERE id = ${pId}
    `;
    // Estorno: reabrir/reverter venda conforme regras de negócio
    if (body.status === "estornado") {
      try {
        await estornarVenda(vendaId, pId, { motivo: "Estorno manual via painel" });
      } catch (e) {
        console.error(`[pagamentos/PATCH] estornarVenda venda=${vendaId} pag=${pId}:`, e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/vendas/[id]/pagamentos/[pagId] ────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pagId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, pagId } = await params;
  const vendaId = Number(id);
  const pId     = Number(pagId);
  if (isNaN(vendaId) || isNaN(pId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [pag] = await sql`
    SELECT p.id, p.status, v.bloqueado, v.situacao AS venda_situacao
    FROM alissonerp.pagamentos_venda p
    JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
    WHERE p.id = ${pId} AND p.venda_id = ${vendaId}
  `;
  if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  if (pag.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });
  if (pag.venda_situacao === "cancelado") return NextResponse.json({ error: "Venda cancelada" }, { status: 409 });
  if (pag.venda_situacao === "concluido") return NextResponse.json({ error: "Venda concluída não permite exclusão de pagamento" }, { status: 409 });
  if (pag.status === "confirmado") return NextResponse.json({ error: "Pagamento confirmado não pode ser excluído — estorne primeiro" }, { status: 409 });

  // Onda 1D: consultora so deleta pagamento de venda propria
  try { await checkOwnership(user.id, vendaId); }
  catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await sql`DELETE FROM alissonerp.pagamentos_venda WHERE id = ${pId}`;

  return NextResponse.json({ ok: true });
}
