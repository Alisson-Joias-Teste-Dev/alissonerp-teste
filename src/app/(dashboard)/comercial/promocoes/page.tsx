import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import PromocoesClient from "./PromocoesClient";

export const metadata = { title: "Promocoes" };

export default async function PromocoesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "promocoes", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role ?? "", "promocoes", "escrever");
  return <PromocoesClient podeEditar={podeEditar} />;
}
