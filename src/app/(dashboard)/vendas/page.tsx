import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import VendasClient from "./VendasClient";

export default async function VendasPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "consultora";
  let vendedorId: number | null = null;
  let nomeUsuario = "";

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, nome
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role        = u.role as string;
      vendedorId  = u.vendedor_id ? Number(u.vendedor_id) : null;
      nomeUsuario = u.nome as string;
    }
  }

  return (
    <VendasClient
      role={role}
      vendedorId={vendedorId}
      nomeUsuario={nomeUsuario}
    />
  );
}
