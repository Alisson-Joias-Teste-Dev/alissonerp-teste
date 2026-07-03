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

    // Promise.race: tenta completar a sync em até 8s.
    // Se der certo ou falhar rápido, mostra o resultado real pro usuário.
    // Se demorar, cai pro fire-and-forget (202) e roda em background.
    const result = await Promise.race([
      syncContatoToTiny(contatoId),
      new Promise<{ ok: false; erro: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, erro: "TIMEOUT_PENDING" }), 8_000)
      ),
    ]);

    if (result.erro === "TIMEOUT_PENDING") {
      syncContatoToTiny(contatoId)
        .then((r) => {
          if (!r.ok) console.error(`[tiny-sync bg] contato ${contatoId}: ${r.erro}`);
        })
        .catch((e) => console.error(`[tiny-sync bg] contato ${contatoId}:`, e));

      return NextResponse.json({ ok: true, pending: true }, { status: 202 });
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.erro }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tiny_id: result.tiny_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
