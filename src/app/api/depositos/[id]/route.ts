import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const PatchSchema = z.object({
  nome: z.string().max(200).optional(),
  ativo: z.boolean().optional(),
});

// PATCH /api/depositos/[id] — editar nome ou ativar/desativar
// Body: { nome?: string, ativo?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const depositoId = parseInt(id);
    const raw = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
      await sql`
        UPDATE alissonerp.depositos SET nome = ${nome}, updated_at = NOW() WHERE id = ${depositoId}
      `;
    }

    if (body.ativo !== undefined) {
      if (depositoId === 1 && body.ativo === false) {
        return NextResponse.json({ error: "Almoxarifado Central não pode ser desativado" }, { status: 400 });
      }
      await sql`
        UPDATE alissonerp.depositos SET ativo = ${body.ativo}, updated_at = NOW() WHERE id = ${depositoId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[PATCH /api/depositos/[id]]", err);
  }
}

// DELETE /api/depositos/[id] — soft delete (ativo = false)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const depositoId = parseInt(id);

    if (depositoId === 1) {
      return NextResponse.json({ error: "Almoxarifado Central não pode ser removido" }, { status: 400 });
    }

    await sql`
      UPDATE alissonerp.depositos SET ativo = false, updated_at = NOW() WHERE id = ${depositoId}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[DELETE /api/depositos/[id]]", err);
  }
}
