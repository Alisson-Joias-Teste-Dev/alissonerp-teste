import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// ─── GET /api/vendas/produtos/busca?q=&limit= ─────────────────────────────────
// Busca produtos em public.produtos (READONLY)
// Retorna id, sku, nome, preco_venda, peso_precificado e estoque agregado
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q       = (searchParams.get("q")?.trim() ?? "").replace(",", ".");
  // Divide termos por espaço para busca multi-palavra (ex: "diamante 3.4" → AND de cada termo)
  const termos  = q.split(/\s+/).filter(Boolean);
  const limit   = Math.min(Number(searchParams.get("limit") ?? "20"), 100);
  const servico = searchParams.get("servico") === "1";

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const produtos = await sql`
    SELECT
      p.id_produto AS id,
      p.sku,
      p.nome,
      -- Joias: preco_curva (cotação atual × peso × markup) | Pedras: preco_tiny (manual)
      CASE
        WHEN p.categoria ILIKE 'Pedras%'
          THEN COALESCE(p.preco_tiny::numeric, 0)
        WHEN p.peso_precificado > 0
         AND COALESCE(p.markup::numeric, 0) > 0
         AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
          THEN ROUND(
            p.peso_precificado::numeric
            * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
            * p.markup::numeric
            * COALESCE(p.fator::numeric, 1)
            / 10
          )::int * 10
        ELSE COALESCE(p.preco_sync::numeric, p.preco_tiny::numeric, 0)
      END AS preco_venda,
      p.peso_precificado,
      p.unidade,
      ep.sufixo_variacao,
      ep.numeracao,
      ep.largura_aro,
      COALESCE(est.saldo, 0) AS saldo_disponivel,
      (ftp.id IS NOT NULL) AS tem_ficha_tecnica
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    LEFT JOIN (
      -- vw_saldo_estoque_comercial expõe: total_entradas, total_saidas,
      -- saldo_atual, reservado, disponivel. Para venda interessa o disponível
      -- (saldo_atual − reservado). Mantemos SUM+GROUP BY por segurança caso
      -- a view venha a devolver mais de uma linha por produto.
      SELECT produto_id, SUM(disponivel) AS saldo
      FROM alissonerp.vw_saldo_estoque_comercial
      GROUP BY produto_id
    ) est ON est.produto_id = p.id_produto
    LEFT JOIN alissonerp.fichas_tecnicas_produto ftp ON ftp.produto_id = p.id_produto
    WHERE
      (p.sku ILIKE ${'%' + q + '%'} OR ${termos.map(t => sql`p.nome ILIKE ${'%' + t + '%'}`).reduce((a, b) => sql`${a} AND ${b}`)})
      AND (ep.eh_pai IS NULL OR ep.eh_pai = false)
    ORDER BY
      (p.situacao = 'A')                     DESC,
      (p.preco_sync IS NOT NULL AND p.preco_sync > 0) DESC,
      (p.tipo = 'S')                          DESC,
      (LOWER(p.sku)  = LOWER(${q}))           DESC,
      (LOWER(p.nome) LIKE LOWER(${q + '%'}))  DESC,
      p.nome
    LIMIT ${limit}
  `;

  return NextResponse.json(
    produtos.map((p) => ({
      ...p,
      preco_venda:       p.preco_venda       != null ? Number(p.preco_venda)       : null,
      peso_precificado:  p.peso_precificado  != null ? Number(p.peso_precificado)  : null,
      saldo_disponivel:  Number(p.saldo_disponivel ?? 0),
      tem_ficha_tecnica: Boolean(p.tem_ficha_tecnica),
    }))
  );
}
