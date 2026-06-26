/**
 * page.tsx — SSR da tela do entregador.
 *
 * REGRA DE NEGÓCIO: motoboys logados são redirecionados automaticamente
 * para esta tela. Só veem suas próprias entregas.
 */
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import MotoboyAppClient from "./MotoboyAppClient";

export const dynamic = "force-dynamic";

export default async function MotoboyAppPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [motoboy] = await sql`
    SELECT id, user_id, nome
    FROM alissonerp.motoboys
    WHERE user_id = ${user.id}::uuid AND ativo = true
    LIMIT 1
  `;

  if (!motoboy) redirect("/");

  return <MotoboyAppClient motoboyNome={motoboy.nome} />;
}
