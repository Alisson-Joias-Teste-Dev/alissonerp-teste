import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import RelatoriosClient from "./RelatoriosClient";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <RelatoriosClient />;
}
