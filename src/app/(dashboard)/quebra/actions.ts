"use server";

import sql from "@/lib/db";

export async function getQuebraOperadoresBySetor(setorId: number) {
  const rows = await sql`
    SELECT setor_id, setor_nome, operador_id, operador_nome,
           total_ordens, total_metal, total_pmc, total_retorno,
           total_quebra, percentual_medio
    FROM alissonerp.vw_quebra_setor_operador
    WHERE setor_id = ${setorId}
    ORDER BY total_quebra DESC
  `;
  return rows.map((r) => ({ ...r }));
}

export async function getQuebraOrdensByOperador(
  operadorId: string | null,
  setorId: number,
) {
  if (operadorId) {
    const rows = await sql`
      SELECT p.id AS pcp_id, o.numero_ordem, p.total_metal, p.pmc,
             p.retorno_metal, p.quebra, p.data_conclusao,
             CASE
               WHEN p.pmc > 0
               THEN ROUND((p.quebra / NULLIF(p.pmc, 0) * 100)::numeric, 2)
               ELSE 0
             END AS percentual_quebra
      FROM alissonerp.pcp p
      JOIN alissonerp.ordens o ON o.id = p.ordem_id
      JOIN alissonerp.distribuicao_ordens doo ON doo.ordens_id = p.ordem_id
      JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
      WHERE p.operador = ${operadorId}::uuid
        AND d.setor_id = ${setorId}
        AND p.etapas = 'concluido'
        AND p.total_metal > 0
      ORDER BY p.data_conclusao DESC
      LIMIT 100
    `;
    return rows.map((r) => ({ ...r }));
  }

  // operador NULL
  const rows = await sql`
    SELECT p.id AS pcp_id, o.numero_ordem, p.total_metal, p.pmc,
           p.retorno_metal, p.quebra, p.data_conclusao,
           CASE
             WHEN p.pmc > 0
             THEN ROUND((p.quebra / NULLIF(p.pmc, 0) * 100)::numeric, 2)
             ELSE 0
           END AS percentual_quebra
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    JOIN alissonerp.distribuicao_ordens doo ON doo.ordens_id = p.ordem_id
    JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
    WHERE p.operador IS NULL
      AND d.setor_id = ${setorId}
      AND p.etapas = 'concluido'
      AND p.total_metal > 0
    ORDER BY p.data_conclusao DESC
    LIMIT 100
  `;
  return rows.map((r) => ({ ...r }));
}
