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

    // Tenta completar em até 5s. Se demorar mais, cai pro fire-and-forget.
    // Se completar rápido, mostra o resultado real (sucesso ou erro) pro usuário.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const result = await syncContatoToTiny(contatoId, controller.signal);
      clearTimeout(timeout);

      if (!result.ok) {
        return NextResponse.json({ error: result.erro }, { status: 502 });
      }
      return NextResponse.json({ ok: true, tiny_id: result.tiny_id });
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === "AbortError") {
        // Excedeu 5s → fire-and-forget
        syncContatoToTiny(contatoId)
          .then((r) => {
            if (!r.ok) console.error(`[tiny-sync bg] contato ${contatoId} falhou: ${r.erro}`);
          })
          .catch((e) => console.error(`[tiny-sync bg] contato ${contatoId} erro:`, e));

        return NextResponse.json({ ok: true, pending: true }, { status: 202 });
      }

      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
