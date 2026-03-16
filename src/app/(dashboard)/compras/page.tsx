import sql from "@/lib/db";
import ComprasClient from "@/components/ComprasClient";

export const dynamic = 'force-dynamic';

export default async function ComprasPage() {
  const compras = await sql`
    SELECT
      c.id,
      c.situacao,
      c.total,
      c.obs,
      c.bloqueado,
      c.created_at,
      ct.nome AS fornecedor_nome,
      COUNT(ic.id)::integer AS total_itens
    FROM alissonerp.compras c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
    GROUP BY c.id, ct.nome
    ORDER BY c.id DESC
    LIMIT 100
  `;

  return <ComprasClient compras={compras as any[]} />;
}
