import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const ROLES_SETORES_WRITE = ["admin", "desenvolvedor"];

const SetorPatchSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  deposito_id: z.number().int().positive().nullable().optional(),
  ativo: z.boolean().optional(),
  requer_peso: z.boolean().optional(),
  ordem: z.number().int().min(0).optional(),
}).passthrough();

// PATCH /api/setores/[id] — editar nome, deposito_id, ativo, requer_peso, ordem
// Body: { nome?: string, deposito_id?: number | null, ativo?: boolean, requer_peso?: boolean, ordem?: number }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_SETORES_WRITE.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const setorId = parseInt(id);
    const raw = await req.json().catch(() => ({}));
    const parsed = SetorPatchSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    if (body.nome !== undefined) {
      const nome = body.nome.trim();
      if (!nome) return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
      await sql`UPDATE alissonerp.setores SET nome = ${nome}, updated_at = NOW() WHERE id = ${setorId}`;
    }

    if (body.deposito_id !== undefined) {
      await sql`UPDATE alissonerp.setores SET deposito_id = ${body.deposito_id}, updated_at = NOW() WHERE id = ${setorId}`;
    }

    if (body.ativo !== undefined) {
      await sql`UPDATE alissonerp.setores SET ativo = ${body.ativo}, updated_at = NOW() WHERE id = ${setorId}`;
    }

    if (body.requer_peso !== undefined) {
      await sql`UPDATE alissonerp.setores SET requer_peso = ${body.requer_peso}, updated_at = NOW() WHERE id = ${setorId}`;
    }

    if (body.ordem !== undefined) {
      const novaOrdem = Number(body.ordem);
      if (!Number.isInteger(novaOrdem) || novaOrdem < 0) {
        return NextResponse.json({ error: "ordem inválida (inteiro >= 0)" }, { status: 400 });
      }
      await sql`UPDATE alissonerp.setores SET ordem = ${novaOrdem}, updated_at = NOW() WHERE id = ${setorId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[PATCH /api/setores/[id]]", err);
  }
}

// DELETE /api/setores/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_SETORES_WRITE.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await sql`UPDATE alissonerp.setores SET ativo = false, updated_at = NOW() WHERE id = ${parseInt(id)}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[DELETE /api/setores/[id]]", err);
  }
}
