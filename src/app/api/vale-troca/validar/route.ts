import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { validarValeTroca } from "@/lib/vale-troca";

// POST /api/vale-troca/validar
// Body: { numero }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const body = await req.json() as { numero?: string };
  if (!body.numero) return NextResponse.json({ error: "numero obrigatorio" }, { status: 400 });

  const res = await validarValeTroca(body.numero.trim());
  return NextResponse.json(res);
}
