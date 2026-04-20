import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/notificacoes/adiar
// Silencia APENAS O SOM do alarme do usuário logado por N minutos.
// O banner vermelho continua visível durante o snooze — só o bip para.
// Body: { minutos?: number } — default 5, clamp 1..60.
//
// O snooze é global (1 registro em alissonerp.usuarios), então vale para
// TODAS as menções pendentes — inclusive novas que chegarem na janela.
// Quando NOW() >= silenciado_ate, o som volta automaticamente no próximo
// polling (até 10s depois).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let minutos = 5;
  try {
    const body = (await req.json()) as { minutos?: number } | null;
    if (body && typeof body.minutos === "number" && isFinite(body.minutos)) {
      minutos = Math.min(60, Math.max(1, Math.round(body.minutos)));
    }
  } catch {
    // body vazio ou inválido: mantém default
  }

  const [atualizado] = await sql<
    { notif_alarme_silenciado_ate: Date | null }[]
  >`
    UPDATE alissonerp.usuarios
    SET notif_alarme_silenciado_ate = NOW() + (${minutos} || ' minutes')::interval
    WHERE id = ${user.id}::uuid
    RETURNING notif_alarme_silenciado_ate
  `;

  if (!atualizado) {
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    minutos,
    silenciado_ate: atualizado.notif_alarme_silenciado_ate,
  });
}
