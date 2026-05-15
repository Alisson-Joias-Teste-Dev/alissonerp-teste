import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ACOES_VALIDAS = ["abrir_purificacao", "concluir_purificacao", "abrir_ligacao", "concluir_ligacao", "editar_teor_ligacao"] as const;

// GET /api/configuracoes/permissoes-usuario?user_id=UUID
export async function GET(req: NextRequest) {
  const user_id = req.nextUrl.searchParams.get("user_id");
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
  }

  const rows = await sql`
    SELECT acao, permitido
    FROM alissonerp.permissoes_usuario
    WHERE usuario_id = ${user_id}::uuid
  `;

  const permissoes: Record<string, boolean> = {};
  for (const acao of ACOES_VALIDAS) {
    const found = rows.find(r => r.acao === acao);
    permissoes[acao] = found ? (found.permitido as boolean) : false;
  }

  return NextResponse.json({ permissoes });
}

// PATCH /api/configuracoes/permissoes-usuario
// Body: { user_id: UUID, permissoes: { abrir_purificacao: true, ... } }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Só admin/desenvolvedor podem alterar permissões de outros
  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!caller || !isFullAccess(caller.role as string)) {
    return NextResponse.json(
      { error: "Somente admin e desenvolvedor podem alterar permissões." },
      { status: 403 },
    );
  }

  const body = await req.json() as {
    user_id: string;
    permissoes: Record<string, boolean>;
  };

  const { user_id, permissoes } = body;
  if (!user_id || !permissoes) {
    return NextResponse.json({ error: "user_id e permissoes obrigatórios" }, { status: 400 });
  }

  for (const [acao, permitido] of Object.entries(permissoes)) {
    if (!ACOES_VALIDAS.includes(acao as typeof ACOES_VALIDAS[number])) continue;
    await sql`
      INSERT INTO alissonerp.permissoes_usuario (usuario_id, acao, permitido)
      VALUES (${user_id}::uuid, ${acao}, ${permitido})
      ON CONFLICT (usuario_id, acao)
      DO UPDATE SET permitido = ${permitido}, updated_at = now()
    `;
  }

  return NextResponse.json({ ok: true });
}
