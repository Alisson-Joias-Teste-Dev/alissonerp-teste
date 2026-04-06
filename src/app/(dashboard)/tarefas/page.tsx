import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import TarefasClient from "./TarefasClient";

export const metadata = { title: "Tarefas" };

export default async function TarefasPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <TarefasClient />;
}
