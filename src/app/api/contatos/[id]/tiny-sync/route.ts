import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncContatoToTiny } from "@/lib/tiny-contatos";

const TOTAL_TIMEOUT_MS = 25_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;
    const contatoId = Number(id);
    if (isNaN(contatoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

    const result = await syncContatoToTiny(contatoId, controller.signal);
    clearTimeout(timeout);

    if (!result.ok) {
      return NextResponse.json({ error: result.erro }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tiny_id: result.tiny_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno ao sincronizar contato";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
