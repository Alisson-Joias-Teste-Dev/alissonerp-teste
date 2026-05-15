import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// GET /api/vale-troca/[id] — detalhe + origem + vales-filho
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
  const valeId = Number(id);
  if (isNaN(valeId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const [vale] = await sql`
    SELECT vt.*, c.nome AS cliente_nome,
           d.numero AS devolucao_numero
    FROM alissonerp.vale_troca vt
    LEFT JOIN public.contatos c           ON c.id_contato = vt.cliente_id
    LEFT JOIN alissonerp.devolucoes_venda d ON d.id = vt.devolucao_id
    WHERE vt.id = ${valeId}
  `;
  if (!vale) return NextResponse.json({ error: "Vale nao encontrado" }, { status: 404 });

  const [origem] = vale.vale_origem_id
    ? await sql`
        SELECT id, numero, valor_original, status
        FROM alissonerp.vale_troca WHERE id = ${vale.vale_origem_id}
      `
    : [null];

  const filhos = await sql`
    SELECT id, numero, valor_original, valor_disponivel, status, created_at
    FROM alissonerp.vale_troca
    WHERE vale_origem_id = ${valeId}
    ORDER BY id
  `;

  return NextResponse.json({
    ...vale,
    valor_original: Number(vale.valor_original),
    valor_disponivel: Number(vale.valor_disponivel),
    origem: origem
      ? { ...origem, valor_original: Number(origem.valor_original) }
      : null,
    filhos: filhos.map((f) => ({
      ...f,
      valor_original: Number(f.valor_original),
      valor_disponivel: Number(f.valor_disponivel),
    })),
  });
}
