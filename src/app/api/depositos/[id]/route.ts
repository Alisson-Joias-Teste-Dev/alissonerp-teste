import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/depositos/[id] — editar nome ou ativar/desativar
// Body: { nome?: string, ativo?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const depositoId = parseInt(id);
    const body = await req.json() as { nome?: string; ativo?: boolean };

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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/depositos/[id] — soft delete (ativo = false)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
