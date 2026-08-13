import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import ComprasClient from "@/components/ComprasClient";

export const dynamic = 'force-dynamic';

export default async function ComprasPage() {
  const rows = await sql`
    SELECT c.id, c.situacao, c.total, c.bloqueado, c.obs,
      c.local_destino_id, c.numero_nf, c.data_compra, c.data_recebimento,
      c.recebido_por, c.created_at, c.fornecedor_id,
      ct.nome AS fornecedor_nome,
      le.nome AS local_nome,
      u_recebedor.nome AS recebido_por_nome,
      COUNT(ic.id)::int AS total_itens
    FROM alissonerp.compras c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_destino_id
    LEFT JOIN alissonerp.usuarios u_recebedor ON u_recebedor.id = c.recebido_por
    LEFT JOIN alissonerp.itens_compra ic ON ic.compra_id = c.id
    GROUP BY c.id, ct.nome, le.nome, u_recebedor.nome
    ORDER BY c.id DESC
  `;

  const numericFields = ["total", "total_itens", "local_destino_id", "fornecedor_id"];
  const compras = rows.map((r) => normalizeRow(r as Record<string, unknown>, numericFields));

  return <ComprasClient compras={compras as never[]} />;
}
