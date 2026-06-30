import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PaginaAuditoria from "@/components/estoque-comercial/auditoria/PaginaAuditoria";

export const dynamic = "force-dynamic";

export default async function AuditoriaEstoquePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <PaginaAuditoria />;
}
