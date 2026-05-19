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

  let role        = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto = 15;

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, mx_desconto_permitido
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;

      const SUPER = ["desenvolvedor", "admin"];
      if (SUPER.includes(role)) {
        maxDesconto = 100;
      } else if (u.mx_desconto_permitido != null && Number(u.mx_desconto_permitido) > 0) {
        maxDesconto = Number(u.mx_desconto_permitido);
      } else {
        const FULL_ROLES = ["gerente_fabrica", "financeiro"];
        if (FULL_ROLES.includes(role)) maxDesconto = 30;
        else if (role === "gerente_loja") maxDesconto = 50;
        else maxDesconto = 15;
      }
    }
  }

  const descontoAuthThreshold = maxDesconto;

  return (
    <VendaDetalheClient
      vendaId={Number(id)}
      role={role}
      vendedorId={vendedorId}
      isFullAccess={FULL_ACCESS.includes(role)}
      maxDesconto={maxDesconto}
      descontoAuthThreshold={descontoAuthThreshold}
    />
  );
}
