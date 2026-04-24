import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import ProdutosClient from "./ProdutosClient";

export const metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;

  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) redirect("/");

  const podeEditar = await temAcessoModulo(role ?? "", "produtos", "escrever");

  return <ProdutosClient podeEditar={podeEditar} />;
}
