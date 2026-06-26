import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { zodError } from "@/lib/schemas/common";

const AlterarSenhaSchema = z.object({
  senha_atual: z.string().min(1, "Senha atual obrigatoria").max(200),
  nova_senha: z.string().min(6, "Nova senha deve ter ao menos 6 caracteres").max(200),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Bruteforce na senha atual: limita por user.id (autenticado, ja temos)
  // + IP (defesa em camadas caso atacante use varias sessoes).
  try {
    rateLimit(`alterar-senha:user:${user.id}`, 5, 60_000);
    rateLimit(`alterar-senha:ip:${getClientIp(req)}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = AlterarSenhaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { senha_atual, nova_senha } = parsed.data;

  if (!user.email) return NextResponse.json({ error: "Email do usuário não encontrado" }, { status: 400 });

  // Validate current password using signInWithPassword
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senha_atual,
  });
  if (signInError) {
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
  }

  // Update password via Supabase admin
  const { error: updateError } = await supabase.auth.updateUser({ password: nova_senha });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
