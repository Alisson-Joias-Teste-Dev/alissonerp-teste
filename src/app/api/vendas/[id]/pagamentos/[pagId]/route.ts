import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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
    SELECT p.id, v.bloqueado
    FROM alissonerp.pagamentos_venda p
    JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
    WHERE p.id = ${pId} AND p.venda_id = ${vendaId}
  `;
  if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  if (pag.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

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
  } else {
    await sql`
      UPDATE alissonerp.pagamentos_venda SET
        status           = ${body.status},
        data_confirmacao = COALESCE(${body.data_confirmacao ?? null}::timestamptz, data_confirmacao),
        gateway_id       = COALESCE(${body.gateway_id      ?? null},              gateway_id)
      WHERE id = ${pId}
    `;
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

  await sql`DELETE FROM alissonerp.pagamentos_venda WHERE id = ${pId}`;

  return NextResponse.json({ ok: true });
}
