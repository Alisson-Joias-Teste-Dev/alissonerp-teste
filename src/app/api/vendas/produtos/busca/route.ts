import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// ─── GET /api/vendas/produtos/busca?q=&limit= ─────────────────────────────────
// Busca produtos em public.produtos (READONLY)
// Retorna id, sku, nome, preco_venda (curva dinâmica), peso_precificado e estoque agregado
//
// Promocao: se o produto tem promo ativa (migration 248), preco_promo vem
// preenchido + em_promocao=true. O preco_venda continua sendo o de lista
// (curva dinâmica) - o POS aplica o desconto no calcItem.
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

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
      -- Preço calculado pela view oficial vw_produto_preco (curva dinâmica).
      pp.preco_venda,
      p.peso_precificado,
      p.unidade,
      ep.sufixo_variacao,
      ep.numeracao,
      ep.largura_aro,
      COALESCE(est.saldo, 0) AS saldo_disponivel,
      (ftp.id IS NOT NULL) AS tem_ficha_tecnica,
      COALESCE(rfid.qtd, 0) AS rfid_disponivel,
      COALESCE(ecc.controla_estoque, true) AS controla_estoque,
      -- Promocao vigente (migration 248) + regra de pagamento (migration 257)
      CASE WHEN vpv.em_promocao THEN vpv.preco_vigente ELSE NULL END AS preco_promo,
      COALESCE(vpv.em_promocao, false) AS em_promocao,
      vpv.nome_campanha AS promocao_nome,
      CASE WHEN vpv.em_promocao THEN vpv.max_parcelas_cartao ELSE NULL END AS max_parcelas_promo
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
    LEFT JOIN alissonerp.vw_produto_preco_vigente vpv ON vpv.id_produto = p.id_produto
    LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
    LEFT JOIN (
      SELECT produto_id, SUM(disponivel) AS saldo
      FROM alissonerp.vw_saldo_estoque_comercial
      GROUP BY produto_id
    ) est ON est.produto_id = p.id_produto
    LEFT JOIN alissonerp.produto_reposicao_config prc ON prc.produto_id = p.id_produto AND prc.ativo = true
    LEFT JOIN alissonerp.fichas_tecnicas_produto ftp ON ftp.produto_id = p.id_produto
    LEFT JOIN (
      SELECT produto_id, COUNT(*)::int AS qtd
      FROM alissonerp.joias_rfid
      WHERE status = 'ativo'
      GROUP BY produto_id
    ) rfid ON rfid.produto_id = p.id_produto
    WHERE
      p.situacao = 'A'
      AND (p.sku ILIKE ${'%' + q + '%'} OR ${termos.map(t => sql`p.nome ILIKE ${'%' + t + '%'}`).reduce((a, b) => sql`${a} AND ${b}`)})
      AND (ep.eh_pai IS NULL OR ep.eh_pai = false)
      AND pp.preco_venda IS NOT NULL
      AND pp.preco_venda > 0
      AND (
        COALESCE(ecc.controla_estoque, true) = false
        OR COALESCE(est.saldo, 0) > 0
        OR prc.ativo = true
      )
    ORDER BY
      (p.situacao = 'A')                     DESC,
      (pp.preco_venda IS NOT NULL AND pp.preco_venda > 0) DESC,
      (p.tipo = 'S')                          DESC,
      (LOWER(p.sku)  = LOWER(${q}))           DESC,
      (LOWER(p.nome) LIKE LOWER(${q + '%'}))  DESC,
      p.nome
    LIMIT ${limit}
  `;

  return NextResponse.json(
    produtos.map((p) => ({
      id: Number(p.id),
      ...p,
      preco_venda:       p.preco_venda       != null ? Number(p.preco_venda)       : null,
      peso_precificado:  p.peso_precificado  != null ? Number(p.peso_precificado)  : null,
      saldo_disponivel:  Number(p.saldo_disponivel ?? 0),
      tem_ficha_tecnica: Boolean(p.tem_ficha_tecnica),
      rfid_disponivel:   Number(p.rfid_disponivel ?? 0),
      preco_promo:        p.preco_promo        != null ? Number(p.preco_promo)        : null,
      em_promocao:        Boolean(p.em_promocao),
      promocao_nome:      p.promocao_nome ?? null,
      max_parcelas_promo: p.max_parcelas_promo != null ? Number(p.max_parcelas_promo) : null,
    }))
  );
}
