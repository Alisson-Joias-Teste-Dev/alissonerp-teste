import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import ComprasComercialClient from "@/components/ComprasComercialClient";

// REGRA DE NEGOCIO:
// - O que faz: carrega lista inicial de compras comerciais para renderizacao SSR.
// - Por que: melhora tempo de primeira tela e garante dados consistentes para operacao.
// - Impacto se alterado/removido: experiencia inicial piora e pode haver inconsistencias na listagem.

export const dynamic = "force-dynamic";

export default async function ComprasComercialPage() {
  const rows = await sql`
    SELECT c.id, c.situacao, c.total, c.bloqueado, c.obs,
      c.local_estoque_id, c.numero_nf, c.data_compra, c.data_recebimento,
      c.recebido_por, c.created_at, c.fornecedor_id,
      c.qtd_parcelas, c.primeiro_vencimento,
      ct.nome AS fornecedor_nome,
      le.nome AS local_nome,
      u_recebedor.nome AS recebido_por_nome,
      COUNT(ic.id)::int AS total_itens
    FROM alissonerp.compras_comercial c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_estoque_id
    LEFT JOIN alissonerp.usuarios u_recebedor ON u_recebedor.id = c.recebido_por
    LEFT JOIN alissonerp.itens_compra_comercial ic ON ic.compra_comercial_id = c.id
    GROUP BY c.id, ct.nome, le.nome, u_recebedor.nome
    ORDER BY c.id DESC
  `;

  const numericFields = ["total", "total_itens", "local_estoque_id", "fornecedor_id", "qtd_parcelas"];
  const compras = rows.map((r) => normalizeRow(r as Record<string, unknown>, numericFields));

  return <ComprasComercialClient compras={compras as never[]} />;
}
