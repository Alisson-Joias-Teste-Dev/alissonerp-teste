import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import AnaliseResultadoClient from "./AnaliseResultadoClient";

const PODE_GERENCIAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export default async function AnaliseResultadoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "consultora";
  let vendedorId: number | null = null;

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (u) { role = u.role as string; vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null; }
  }

  return (
    <AnaliseResultadoClient
      role={role}
      vendedorId={vendedorId}
      podeGerenciar={PODE_GERENCIAR.includes(role)}
    />
  );
}
