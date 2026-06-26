import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const ROLES_EDITAR_TEOR = ["admin", "desenvolvedor"];

const TeorPatchSchema = z.object({
  teor: z.coerce.number().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

// PATCH /api/purificacao/teores/[id] — atualizar teor
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id } = await params;
  const teor_id = parseInt(id);
  if (isNaN(teor_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = TeorPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { teor, ativo } = parsed.data;

  // Validar role (vem da sessão autenticada, nunca do body)
  if (!ROLES_EDITAR_TEOR.includes(user.role)) {
    return NextResponse.json(
      { error: "Acesso negado. Somente admin e desenvolvedor podem editar teores" },
      { status: 403 },
    );
  }

  if (teor !== undefined && (teor <= 0 || teor > 1)) {
    return NextResponse.json(
      { error: "Teor deve ser entre 0 e 1 (ex: 0.75 para 18k)" },
      { status: 400 },
    );
  }

  const [existing] = await sql`
    SELECT id FROM alissonerp.teores_ouro WHERE id = ${teor_id}
  `;
  if (!existing) {
    return NextResponse.json({ error: "Teor não encontrado" }, { status: 404 });
  }

  const [updated] = await sql`
    UPDATE alissonerp.teores_ouro SET
      teor       = COALESCE(${teor ?? null}::numeric, teor),
      ativo      = COALESCE(${ativo ?? null}::boolean, ativo),
      updated_at = NOW()
    WHERE id = ${teor_id}
    RETURNING id, insumo_id, nome, teor, ativo, updated_at
  `;

  return NextResponse.json(updated);
}
