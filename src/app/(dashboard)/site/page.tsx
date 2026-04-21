import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import SiteClient from "./SiteClient";

export const metadata = { title: "Site (WooCommerce/WordPress)" };

export default async function SitePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) redirect("/");

  return <SiteClient />;
}
