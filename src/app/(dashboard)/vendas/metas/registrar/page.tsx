import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import MetasRegistrarClient from "./MetasRegistrarClient";
import { redirect } from "next/navigation";

const PODE_GERENCIAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export default async function MetasRegistrarPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role = "consultora";
  if (user) {
    const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
    if (u) role = u.role as string;
  }

  if (!PODE_GERENCIAR.includes(role)) redirect("/vendas/metas");

  const vendedores = await sql`
    SELECT id_vendedor AS id, nome
    FROM public.vendedores
    WHERE situacao = 'Ativo' OR situacao IS NULL
    ORDER BY nome
  `;

  return (
    <MetasRegistrarClient
      vendedores={vendedores.map(v => ({ id: Number(v.id), nome: v.nome as string }))}
    />
  );
}
