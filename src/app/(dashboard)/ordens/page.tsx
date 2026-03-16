import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import OrdensClient from "@/components/OrdensClient";

export default async function OrdensPage() {
  // Auth — consultora vê só as ordens do seu vendedor_id
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let vendedorIdFiltro: number | null = null;
  if (user) {
    const [usuario] = await sql`
      SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (usuario?.role === "consultora" && usuario.vendedor_id != null) {
      vendedorIdFiltro = usuario.vendedor_id as number;
    }
  }

  const ordens = vendedorIdFiltro != null
    ? await sql`
        SELECT
          id, numero_ordem, numero_pedido,
          situacao, status, rota, tipo_ordem,
          setor_nome, vendedor_nome, cliente_nome,
          peso_metal_negociado, data_entrega, date_created
        FROM alissonerp.vw_ordens_completa
        WHERE vendedor_id = ${vendedorIdFiltro}
        ORDER BY id DESC
        LIMIT 500
      `
    : await sql`
        SELECT
          id, numero_ordem, numero_pedido,
          situacao, status, rota, tipo_ordem,
          setor_nome, vendedor_nome, cliente_nome,
          peso_metal_negociado, data_entrega, date_created
        FROM alissonerp.vw_ordens_completa
        ORDER BY id DESC
        LIMIT 200
      `;

  return <OrdensClient ordens={ordens} />;
}
