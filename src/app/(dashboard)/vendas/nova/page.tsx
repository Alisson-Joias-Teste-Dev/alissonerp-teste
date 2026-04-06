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
      role       = u.role as string;
      vendedorId = u.vendedor_id ? Number(u.vendedor_id) : null;

      const SUPER = ["desenvolvedor", "admin"];
      if (SUPER.includes(role)) {
        // Super-admins: desconto irrestrito, ignora coluna individual
        maxDesconto = 100;
      } else if (u.mx_desconto_permitido != null && Number(u.mx_desconto_permitido) > 0) {
        // Valor individual definido explicitamente
        maxDesconto = Number(u.mx_desconto_permitido);
      } else {
        // Padrão por role
        const FULL = ["gerente_fabrica", "gerente_loja", "financeiro"];
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
