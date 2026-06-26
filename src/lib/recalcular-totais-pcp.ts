import sql from "@/lib/db";

/**
 * Recalcula os campos dist_* no PCP a partir dos dados reais de distribuição.
 *
 * Campos atualizados:
 *   dist_ouro_real  = Σ distribuicao_ordens.peso_ouro_real  (saídas da ordem)
 *   dist_pedras_qtd = Σ distribuicao_saida_pedras.qtd_utilizada (saídas da ordem)
 *   dist_pedras_g   = Σ distribuicao_saida_pedras.peso_total    (saídas da ordem)
 *   dist_quebra     = Σ distribuicao_ordens.quebra              (saídas da ordem)
 *
 * Os campos total_metal, retorno_metal, etc. são mantidos pelo trigger
 * fn_processar_apontamento_pcp e NÃO são tocados aqui.
 */
export async function recalcularTotaisPCP(pcpId: number): Promise<void> {
  // 1. Obter ordem_id do PCP
  const [pcp] = await sql`
    SELECT ordem_id FROM alissonerp.pcp WHERE id = ${pcpId} LIMIT 1
  `;
  if (!pcp?.ordem_id) return;

  const ordemId = pcp.ordem_id as number;

  // 2. Pegar dados da ÚLTIMA distribuição concluída para esta ordem
  //    Usa ORDER BY id DESC LIMIT 1 — não soma distribuições anteriores
  const [dist] = await sql`
    SELECT
      COALESCE(doo.peso_ouro_real, 0)::real AS dist_ouro_real,
      COALESCE(doo.quebra,         0)::real AS dist_quebra,
      COALESCE(
        (SELECT SUM(sp.qtd_utilizada)
         FROM alissonerp.distribuicao_saida_pedras sp
         WHERE sp.distribuicao_ordem_id = doo.id),
        0
      )::real AS dist_pedras_qtd,
      COALESCE(
        (SELECT SUM(sp.peso_total)
         FROM alissonerp.distribuicao_saida_pedras sp
         WHERE sp.distribuicao_ordem_id = doo.id),
        0
      )::real AS dist_pedras_g
    FROM alissonerp.distribuicao_ordens doo
    WHERE doo.ordens_id = ${ordemId}
      AND doo.data_baixa IS NOT NULL
    ORDER BY doo.id DESC
    LIMIT 1
  `;

  // 3. Se não há distribuição concluída, não atualizar
  if (!dist) return;

  // 4. UPDATE pcp
  await sql`
    UPDATE alissonerp.pcp
    SET
      dist_ouro_real  = ${dist.dist_ouro_real},
      dist_pedras_qtd = ${dist.dist_pedras_qtd},
      dist_pedras_g   = ${dist.dist_pedras_g},
      dist_quebra     = ${dist.dist_quebra},
      updated_at      = now()
    WHERE id = ${pcpId}
  `;
}
