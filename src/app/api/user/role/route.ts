import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/user/role?user_id=UUID
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Fonte de verdade: alissonerp.usuarios (id = auth.users.id)
  // JOIN por email (fallback seguro para usuários com id_user dessincronizado — ver migration 080)
  const rows = await sql`
    SELECT u.role::text AS role, u.nome AS name, up.avatar_url
    FROM alissonerp.usuarios u
    LEFT JOIN public.user_profiles up ON LOWER(up.email) = LOWER(u.email)
    WHERE u.id = ${userId}::uuid
  `;

  return NextResponse.json({
    role:       rows[0]?.role       ?? "unknown",
    name:       rows[0]?.name       ?? null,
    avatar_url: rows[0]?.avatar_url ?? null,
  });
}
