import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import EstoqueComercialDetalheClient from "./EstoqueComercialDetalheClient";

interface Props { params: Promise<{ produtoId: string }> }

export default async function EstoqueComercialDetalhePage({ params }: Props) {
  const { produtoId } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <EstoqueComercialDetalheClient produtoId={Number(produtoId)} />;
}
