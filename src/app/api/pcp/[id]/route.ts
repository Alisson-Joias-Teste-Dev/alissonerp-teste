import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/[id] — detalhe do PCP com dados da ordem
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT
      p.id, p.etapas::text AS etapas_cod, p.ordem_id,
      p.total_metal, p.retorno_metal, p.metal_externo, p.pmc, p.quebra,
      p.peso_final, p.bloqueado, p.data_conclusao, p.created_at,
      p.dist_ouro_real, p.dist_pedras_qtd, p.dist_pedras_g, p.dist_quebra,
      o.numero_ordem, o.peso_metal_negociado, o.peso_metal_externo, o.data_entrega,
      o.local_atual AS deposito_id, o.setor_atual AS setor_id,
      c.nome AS cliente_nome,
      v.nome AS vendedor_nome,
      dep.nome AS deposito_nome,
      set_.nome AS setor_nome
    FROM alissonerp.pcp p
    LEFT JOIN alissonerp.ordens o ON o.id = p.ordem_id
    LEFT JOIN contatos c ON c.id_contato = o.cliente_id
    LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
    LEFT JOIN alissonerp.depositos dep ON dep.id = o.local_atual
    LEFT JOIN alissonerp.setores set_ ON set_.id = o.setor_atual
    WHERE p.id = ${parseInt(id)}
  `;
  if (!rows[0]) return NextResponse.json({ error: "PCP não encontrado" }, { status: 404 });
  return NextResponse.json(rows[0]);
}
