import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import EstoqueProdutosClient from "./EstoqueProdutosClient";

export const metadata = { title: "Estoque de Produtos" };
export const dynamic = "force-dynamic";

export default async function EstoqueProdutosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) redirect("/");

  return <EstoqueProdutosClient />;
}
