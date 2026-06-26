import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import AutorizacoesClient from "./AutorizacoesClient";
import Link from "next/link";

export default async function AutorizacoesDescontoPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "";
  if (user) {
    const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    if (u) role = u.role as string;
  }

  if (!["desenvolvedor", "admin"].includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-8">
        <p className="text-gray-500 text-sm">Sem permissão para acessar esta página.</p>
        <Link href="/vendas" className="text-sm underline text-gray-400">Voltar para vendas</Link>
      </div>
    );
  }

  return <AutorizacoesClient />;
}
