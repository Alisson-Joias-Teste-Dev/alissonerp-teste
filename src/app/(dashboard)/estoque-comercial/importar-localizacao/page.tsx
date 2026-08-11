import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { isFullAccess } from "@/lib/roles";
import ImportarLocalizacaoClient from "./ImportarLocalizacaoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar localização das peças" };

// Ferramenta de uso unico (admin): semeia a localizacao das pecas a partir da fonte
// externa. Fica restrita a admin/dev — na pratica, so o dono do processo a enxerga.
export default async function ImportarLocalizacaoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) redirect("/estoque-comercial");

  return <ImportarLocalizacaoClient />;
}
