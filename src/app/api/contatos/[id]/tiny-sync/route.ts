import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncContatoToTiny } from "@/lib/tiny-contatos";

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

    // Dispara em background — não bloqueia o gateway (evita 502 HTML do Easypanel)
    syncContatoToTiny(contatoId).catch((err) => {
      console.error(`[tiny-sync] background FALHOU contatoId=${contatoId}`, err);
    });

    return NextResponse.json({ ok: true, status: "background" }, { status: 202 });
  } catch (err) {
    console.error(`[tiny-sync] EXCEPTION`, err);
    const msg = err instanceof Error ? err.message : "Erro interno ao sincronizar contato";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}