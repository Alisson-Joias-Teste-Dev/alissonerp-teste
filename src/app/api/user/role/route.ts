import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/user/role?user_id=UUID
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Fonte de verdade: alissonerp.usuarios (id = auth.users.id)
  // JOIN por email (fallback seguro para usuários com id_user dessincronizado — ver migration 080)
  const rows = await sql`
    SELECT u.role::text AS role, u.nome AS name, u.ativo, up.avatar_url
    FROM alissonerp.usuarios u
    LEFT JOIN public.user_profiles up ON up.id_user = u.id
    WHERE u.id = ${userId}::uuid
  `;

  // BLINDAGEM: usuario desativado nao deve ter acesso ao ERP.
  // 403 sinaliza para o cliente forcar logout (useAuth → DashboardShell).
  if (rows[0]?.ativo === false) {
    return NextResponse.json({ error: "Usuário desativado. Contate o administrador." }, { status: 403 });
  }

  return NextResponse.json({
    role:       rows[0]?.role       ?? "unknown",
    name:       rows[0]?.name       ?? null,
    avatar_url: rows[0]?.avatar_url ?? null,
  });
}
