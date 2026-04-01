import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import NovaVendaClient from "./NovaVendaClient";

export default async function NovaVendaPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let role              = "consultora";
  let vendedorId: number | null = null;
  let maxDesconto       = 15;

  if (user) {
    const [u] = await sql`
      SELECT role, vendedor_id, mx_desconto_permitido
      FROM alissonerp.usuarios
      WHERE id = ${user.id}::uuid
      LIMIT 1
    `;
    if (u) {
      role      = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;

      // mx_desconto_permitido individual sobrepõe regra de role
      if (u.mx_desconto_permitido != null) {
        maxDesconto = Number(u.mx_desconto_permitido);
      } else {
        const FULL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];
        maxDesconto = FULL.includes(role) ? 30 : 15;
      }
    }
  }

  return (
    <NovaVendaClient
      role={role}
      vendedorId={vendedorId}
      maxDesconto={maxDesconto}
    />
  );
}
