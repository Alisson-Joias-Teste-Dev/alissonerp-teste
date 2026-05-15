import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import PromocaoDetalheClient from "./PromocaoDetalheClient";

export const metadata = { title: "Promocao" };

export default async function PromocaoDetalhePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "promocoes", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role ?? "", "promocoes", "escrever");
  const { id } = await params;
  return <PromocaoDetalheClient id={Number(id)} podeEditar={podeEditar} />;
}
