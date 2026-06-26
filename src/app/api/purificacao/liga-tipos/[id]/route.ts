import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const ROLES_EDITAR = ["admin", "desenvolvedor"];

const LigaTipoPatchSchema = z.object({
  teor_default: z.coerce.number(),
}).passthrough();

// PATCH /api/purificacao/liga-tipos/[id] — atualizar teor_default do mapeamento liga
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
  const liga_id = parseInt(id);
  if (isNaN(liga_id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = LigaTipoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { teor_default } = parsed.data;

  if (!ROLES_EDITAR.includes(user.role)) {
    return NextResponse.json(
      { error: "Acesso negado. Somente admin e desenvolvedor podem editar mapeamento liga" },
      { status: 403 },
    );
  }

  if (teor_default === undefined || isNaN(teor_default) || teor_default <= 0 || teor_default > 1) {
    return NextResponse.json(
      { error: "Teor padrão deve ser entre 0.01 e 1 (ex: 0.75 para 18k)" },
      { status: 400 },
    );
  }

  const [existing] = await sql`
    SELECT id FROM alissonerp.liga_tipo_ouro WHERE id = ${liga_id}
  `;
  if (!existing) {
    return NextResponse.json({ error: "Mapeamento não encontrado" }, { status: 404 });
  }

  const [updated] = await sql`
    UPDATE alissonerp.liga_tipo_ouro
    SET teor_default = ${teor_default}::numeric
    WHERE id = ${liga_id}
    RETURNING id, teor_default
  `;

  return NextResponse.json(updated);
}
