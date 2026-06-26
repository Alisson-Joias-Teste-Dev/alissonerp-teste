import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import ValeTrocaClient from "./ValeTrocaClient";

export default async function ValeTrocaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const role = (u?.role as string) ?? "consultora";
  if (!hasRole(role, ROLES_DEVOLUCAO)) redirect("/");

  return <ValeTrocaClient role={role} />;
}
