import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarValeTroca } from "@/lib/vale-troca";
import { zodError } from "@/lib/schemas/common";

const ValeTrocaSchema = z.object({
  numero: z.string().min(1, "obrigatório"),
}).passthrough();

// POST /api/vale-troca/validar
// Body: { numero }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = ValeTrocaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const res = await validarValeTroca(body.numero.trim());
  return NextResponse.json(res);
}
