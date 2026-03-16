import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import ProdutosClient from "./ProdutosClient";

export const metadata = { title: "Produtos" };

export default async function ProdutosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;

  if (!isProdutosAccess(role)) redirect("/");

  return <ProdutosClient />;
}
