import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

const ROLES_PROTEGIDAS = ["desenvolvedor", "admin"] as const;

// PATCH /api/configuracoes/roles/[nome]
// Body: { descricao?: string, ativo?: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { nome } = await params;

  // Proteger desenvolvedor e admin
  if (ROLES_PROTEGIDAS.includes(nome as typeof ROLES_PROTEGIDAS[number])) {
    return NextResponse.json(
      { error: `A role '${nome}' é protegida e não pode ser alterada` },
      { status: 403 }
    );
  }

  const body = await req.json() as { descricao?: string; ativo?: boolean };

  const updates: { descricao?: string; ativo?: boolean } = {};
  if (body.descricao !== undefined) updates.descricao = body.descricao.trim();
  if (body.ativo !== undefined) updates.ativo = body.ativo;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const [updated] = await sql`
    UPDATE alissonerp.roles
    SET
      descricao = COALESCE(${updates.descricao ?? null}, descricao),
      ativo     = COALESCE(${updates.ativo ?? null}, ativo)
    WHERE nome = ${nome}
    RETURNING nome, descricao, ativo
  `;

  if (!updated) {
    return NextResponse.json({ error: "Role não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ success: true, role: updated });
}
