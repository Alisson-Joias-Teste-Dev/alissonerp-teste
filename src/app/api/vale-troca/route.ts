import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// GET /api/vale-troca — lista paginada
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const clienteIdParam = searchParams.get("cliente_id");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;
  const clienteId = clienteIdParam ? Number(clienteIdParam) : null;

  const rows = await sql`
    SELECT vt.id, vt.numero, vt.devolucao_id, vt.cliente_id,
           vt.valor_original, vt.valor_disponivel, vt.status,
           vt.venda_utilizado_id, vt.utilizado_em, vt.vale_origem_id,
           vt.created_at,
           c.nome AS cliente_nome,
           d.numero AS devolucao_numero
    FROM alissonerp.vale_troca vt
    LEFT JOIN public.contatos c           ON c.id_contato = vt.cliente_id
    LEFT JOIN alissonerp.devolucoes_venda d ON d.id = vt.devolucao_id
    WHERE (${status}::text IS NULL OR vt.status = ${status})
      AND (${clienteId}::int IS NULL OR vt.cliente_id = ${clienteId})
    ORDER BY vt.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.vale_troca vt
    WHERE (${status}::text IS NULL OR vt.status = ${status})
      AND (${clienteId}::int IS NULL OR vt.cliente_id = ${clienteId})
  `;

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      valor_original: Number(r.valor_original),
      valor_disponivel: Number(r.valor_disponivel),
    })),
    page, limit, total,
  });
}
