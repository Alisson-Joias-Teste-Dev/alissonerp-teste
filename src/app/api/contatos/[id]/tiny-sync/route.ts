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

    // Fire-and-forget: responde imediatamente, sincronização roda em background.
    // Evita timeout do gateway (502 HTML) quando o refresh OAuth + API Tiny
    // demoram mais que o limite do proxy.
    syncContatoToTiny(contatoId)
      .then((r) => {
        if (!r.ok) console.error(`[tiny-sync bg] contato ${contatoId} falhou: ${r.erro}`);
      })
      .catch((err) => {
        console.error(`[tiny-sync bg] contato ${contatoId} erro:`, err);
      });

    return NextResponse.json({ ok: true, pending: true }, { status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
