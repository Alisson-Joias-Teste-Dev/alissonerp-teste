import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { isFullAccess } from "@/lib/roles";
import EstoqueComercialClient from "./EstoqueComercialClient";

export const dynamic = "force-dynamic";

export default async function EstoqueComercialPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Papel (fonte de verdade = alissonerp.usuarios.role) para liberar a ferramenta de
  // importacao de localizacao so para admin/dev.
  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isAdmin = isFullAccess(usuario?.role);

  return <EstoqueComercialClient isAdmin={isAdmin} />;
}
