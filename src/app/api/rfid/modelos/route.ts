import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";
import { EtiquetaModeloInputSchema } from "@/lib/rfid/tipos";
import { listarModelosEtiqueta, salvarModeloEtiqueta } from "@/lib/rfid/repo";

async function autenticado(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

/** GET /api/rfid/modelos — lista os modelos de etiqueta ativos. */
export async function GET() {
  try {
    if (!(await autenticado())) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const modelos = await listarModelosEtiqueta();
    return NextResponse.json({ modelos });
  } catch (err) {
    return internalError("[GET /api/rfid/modelos]", err);
  }
}

/** POST /api/rfid/modelos — cria ou atualiza (upsert por id) um modelo. */
export async function POST(req: NextRequest) {
  try {
    if (!(await autenticado())) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const raw = await req.json().catch(() => ({}));
    const parsed = EtiquetaModeloInputSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const modelo = await salvarModeloEtiqueta(parsed.data);
    return NextResponse.json({ modelo });
  } catch (err) {
    return internalError("[POST /api/rfid/modelos]", err);
  }
}
