import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import AnaliseFreteClient from "./AnaliseFreteClient";

const PODE_GERENCIAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export default async function AnaliseFretePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "gerente_loja";
  if (user) {
    const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    if (u) role = u.role as string;
  }

  return <AnaliseFreteClient podeGerenciar={PODE_GERENCIAR.includes(role)} />;
}
