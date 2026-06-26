import sql from "@/lib/db";
import EntregaClient from "./EntregaClient";

export const dynamic = 'force-dynamic';

export default async function EntregaPage() {
  const entregas = await sql`
    SELECT
      pe.id,
      pe.etapas::text,
      pe.ordem_id,
      pe.created_at,
      pe.updated_at,
      o.numero_ordem,
      o.tipo_ordem::text,
      o.peso_metal_negociado,
      o.data_entrega,
      o.vendedor_id,
      c.nome AS cliente_nome,
      v.nome AS vendedora_nome
    FROM alissonerp.preparacoes_entrega pe
    LEFT JOIN alissonerp.ordens o ON o.id = pe.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN public.vendedores v ON v.id_vendedor = o.vendedor_id
    ORDER BY pe.id DESC
    LIMIT 500
  `;

  return <EntregaClient entregas={entregas as any[]} />;
}
