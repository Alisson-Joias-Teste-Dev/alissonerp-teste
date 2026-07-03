import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncContatoToTiny } from "@/lib/tiny-contatos";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contatoId = Number(id);
  if (isNaN(contatoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const result = await syncContatoToTiny(contatoId);
  if (!result.ok) {
    return NextResponse.json({ error: result.erro }, { status: 502 });
  }
  return NextResponse.json({ ok: true, tiny_id: result.tiny_id });
}
