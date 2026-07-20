import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { excluirModeloEtiqueta } from "@/lib/rfid/repo";

/** DELETE /api/rfid/modelos/[id] — desativa (soft-delete) um modelo. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const { id } = await params;
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const ok = await excluirModeloEtiqueta(idNum);
    if (!ok) {
      return NextResponse.json({ error: "Modelo não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[DELETE /api/rfid/modelos/[id]]", err);
  }
}
