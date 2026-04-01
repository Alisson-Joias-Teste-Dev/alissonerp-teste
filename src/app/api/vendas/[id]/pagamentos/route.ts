import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/[id]/pagamentos ───────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const pagamentos = await sql`
    SELECT id, venda_id, forma, gateway, valor, parcelas,
           status, gateway_id, data_confirmacao, created_at
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json(
    pagamentos.map((p) => ({ ...p, valor: Number(p.valor) }))
  );
}

// ─── POST /api/vendas/[id]/pagamentos ──────────────────────────────────────────
// Body: { forma, gateway?, valor, parcelas?, status? }
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

  const body = await req.json() as {
    forma:     string;
    gateway?:  string | null;
    valor:     number;
    parcelas?: number;
    status?:   string;
  };

  if (!body.forma) return NextResponse.json({ error: "forma obrigatória" }, { status: 400 });
  if (!body.valor || body.valor <= 0) return NextResponse.json({ error: "valor inválido" }, { status: 400 });

  const [novo] = await sql`
    INSERT INTO alissonerp.pagamentos_venda (
      venda_id, forma, gateway, valor, parcelas, status
    ) VALUES (
      ${vendaId},
      ${body.forma},
      ${body.gateway ?? null},
      ${body.valor},
      ${body.parcelas ?? 1},
      ${body.status ?? 'pendente'}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: novo.id }, { status: 201 });
}
