import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { redirect } from "next/navigation";
import SwaggerPage from "./SwaggerPage";

export default async function DocsApiPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [u] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!["admin", "desenvolvedor"].includes(u?.role)) redirect("/");

  return <SwaggerPage />;
}
