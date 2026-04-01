import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import VendaDetalheClient from "./VendaDetalheClient";

interface Props {
  params: Promise<{ id: string }>;
}

const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];

export default async function VendaDetalhePage({ params }: Props) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role      = "consultora";
  let vendedorId: number | null = null;

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;
    }
  }

  return (
    <VendaDetalheClient
      vendaId={Number(id)}
      role={role}
      vendedorId={vendedorId}
      isFullAccess={FULL_ACCESS.includes(role)}
    />
  );
}
