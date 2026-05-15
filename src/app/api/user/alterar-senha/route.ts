import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { senha_atual, nova_senha } = await req.json();

  if (!senha_atual || !nova_senha) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  }
  if (nova_senha.length < 6) {
    return NextResponse.json({ error: "Nova senha deve ter ao menos 6 caracteres" }, { status: 400 });
  }

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
