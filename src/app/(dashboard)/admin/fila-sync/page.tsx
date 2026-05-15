import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isFullAccess } from "@/lib/roles";
import FilaSyncClient from "./FilaSyncClient";

export const dynamic = "force-dynamic";

export default async function FilaSyncPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) redirect("/");

  return <FilaSyncClient />;
}
