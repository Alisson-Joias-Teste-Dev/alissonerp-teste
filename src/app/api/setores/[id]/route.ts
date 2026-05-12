import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/setores/[id] — editar nome, deposito_id, ativo, requer_peso, ordem
// Body: { nome?: string, deposito_id?: number | null, ativo?: boolean, requer_peso?: boolean, ordem?: number }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const setorId = parseInt(id);
    const body = await req.json() as { nome?: string; deposito_id?: number | null; ativo?: boolean; requer_peso?: boolean; ordem?: number };

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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/setores/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await sql`UPDATE alissonerp.setores SET ativo = false, updated_at = NOW() WHERE id = ${parseInt(id)}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
