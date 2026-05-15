import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import EditorIaClient from "./EditorIaClient";

export const metadata = { title: "Editor IA" };

export default async function EditorIaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await sql<Array<{ role: string | null }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `.catch(() => [] as Array<{ role: string | null }>);
  const role = rows[0]?.role ?? "";

  return <EditorIaClient role={role} />;
}
