import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import GestaoEstoqueClient from "./GestaoEstoqueClient";

export const metadata = { title: "Gestão de Estoque" };

export default async function GestaoEstoquePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Role da FONTE DE VERDADE (alissonerp.usuarios) — user_metadata e editavel
  // pelo proprio usuario via API do GoTrue, entao nao serve de gate.
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const role = (row?.role as string | undefined) ?? "";
  if (!(await temAcessoModulo(role, "produtos", "ler"))) redirect("/");

  return <GestaoEstoqueClient />;
}
