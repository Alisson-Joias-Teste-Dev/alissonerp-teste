import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { concluirDevolucao } from "@/lib/devolucoes";
import { internalError } from "@/lib/api-error";

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

export async function POST(
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
    const res = await concluirDevolucao(devId, user.id);
    return NextResponse.json(res);
  } catch (err) {
    // Postgres errors (code/severity) viram 500 generico — nao vazam schema.
    // Errors de dominio (throw new Error com mensagem amigavel) continuam expostos como 400.
    const isPgError = !!err && typeof err === "object" && ("code" in err || "severity" in err);
    if (isPgError) {
      return internalError(`[POST /api/devolucoes/${devId}/concluir]`, err);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/devolucoes/${devId}/concluir]`, err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
