import sql from "@/lib/db";
import OrdensClient from "@/components/OrdensClient";

export default async function OrdensPage() {
  const ordens = await sql`
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
