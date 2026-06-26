/**
 * GET /api/gestao-estoque/oportunidades-fabricacao
 *
 * Retorna produtos que JA VENDERAM mas estao:
 *  - Com saldo zero/negativo, OU
 *  - Desativados (situacao 'I' ou 'E')
 *
 * Ideia: "esqueci de re-fabricar peca que vendia bem". Ranking por volume
 * historico vendido para priorizar o que retorna rapido.
 *
 * Query params:
 *   min_vendas     (default 3)  — filtra produtos com pelo menos N unidades vendidas
 *   limit          (default 100) — max resultados
 *   incluir_excluidos (default false) — se true, inclui situacao='E'
 *   categoria      (opcional) — filtra por categoria exata
 *
 * Filtra automaticamente SKUs de insumos/servicos (IS*, PD*, AS*, PZ*) e
 * SKUs vazios/genericos ("123") pois nao sao candidatos a fabricacao.
 *
 * Response:
 * {
 *   produtos: Array<{
 *     id_produto, sku, nome, situacao, imagem_capa,
 *     categoria, tipo_metal, peso_precificado, preco_sync, markup,
 *     saldo, qtd_vendida_total, qtd_vendas_distintas, receita_total,
 *     data_ultima_venda, vendas_365d, vendas_90d
 *   }>,
 *   totais: { qtd_skus, qtd_vendida_total_historica, receita_total_historica }
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const minVendasRaw = Number(searchParams.get("min_vendas") ?? 3);
  const minVendas = Math.max(1, Number.isFinite(minVendasRaw) ? minVendasRaw : 3);
  const limitRaw = Number(searchParams.get("limit") ?? 100);
  const limit = Math.max(10, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
  const incluirExcluidos = searchParams.get("incluir_excluidos") === "true";
  const categoria = (searchParams.get("categoria") ?? "").trim() || null;

  try {
    const rows = await sql<Array<{
      id_produto: number;
      sku: string;
      nome: string;
      situacao: string | null;
      imagem_capa: string | null;
      categoria: string | null;
      tipo_metal: string | null;
      peso_precificado: string | null;
      preco_sync: string | null;
      markup: string | null;
      saldo: number;
      qtd_vendida_total: string;
      qtd_vendas_distintas: number;
      receita_total: string;
      data_ultima_venda: Date | null;
      vendas_365d: number;
      vendas_90d: number;
    }>>`
      WITH vendas_agg AS (
        SELECT
          iv.produto_id,
          COUNT(DISTINCT iv.venda_id)::int                                AS qtd_vendas_distintas,
          COALESCE(SUM(iv.quantidade), 0)::numeric                         AS qtd_vendida_total,
          COALESCE(SUM(iv.preco_total), 0)::numeric                        AS receita_total,
          MAX(v.data_venda)                                                AS data_ultima_venda,
          COUNT(DISTINCT CASE WHEN v.data_venda >= CURRENT_DATE - INTERVAL '365 days' THEN v.id END)::int AS vendas_365d,
          COUNT(DISTINCT CASE WHEN v.data_venda >= CURRENT_DATE - INTERVAL '90 days'  THEN v.id END)::int AS vendas_90d
        FROM public.itens_venda iv
        JOIN public.vendas v ON v.id = iv.venda_id
        WHERE iv.produto_id IS NOT NULL
        GROUP BY iv.produto_id
      )
      SELECT
        p.id_produto,
        p.sku,
        p.nome,
        p.situacao,
        vc.url_capa   AS imagem_capa,
        p.categoria,
        p.tipo_metal,
        p.peso_precificado,
        p.preco_sync,
        p.markup,
        COALESCE(e.saldo, 0)::int                AS saldo,
        va.qtd_vendida_total,
        va.qtd_vendas_distintas,
        va.receita_total,
        va.data_ultima_venda,
        va.vendas_365d,
        va.vendas_90d
      FROM alissonerp.produtos_compat p
      JOIN vendas_agg va           ON va.produto_id = p.id_produto
      LEFT JOIN public.estoque e   ON e.sku        = p.sku
      LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
      WHERE
        -- SEM estoque OU desativado
        (COALESCE(e.saldo, 0) <= 0 OR COALESCE(p.situacao, 'I') <> 'A')
        -- Volume minimo de vendas para ser candidato
        AND va.qtd_vendida_total >= ${minVendas}
        -- Se nao quer excluidos, filtra E
        AND (${incluirExcluidos}::boolean OR COALESCE(p.situacao, 'I') <> 'E')
        -- Excluir SKUs de insumos/servicos/pedras/personalizacao (nao sao joia fabricavel)
        AND p.sku IS NOT NULL
        AND p.sku NOT LIKE 'IS%'
        AND p.sku NOT LIKE 'PD%'
        AND p.sku NOT LIKE 'AS%'
        AND p.sku NOT LIKE 'PZ%'
        AND p.sku NOT IN ('', '123')
        -- Categoria filter opcional
        AND (${categoria}::text IS NULL OR p.categoria = ${categoria}::text)
      ORDER BY va.qtd_vendida_total DESC, va.qtd_vendas_distintas DESC
      LIMIT ${limit}
    `;

    const produtos = rows.map(r => ({
      id_produto: r.id_produto,
      sku: r.sku,
      nome: r.nome,
      situacao: r.situacao,
      imagem_capa: r.imagem_capa,
      categoria: r.categoria,
      tipo_metal: r.tipo_metal,
      peso_precificado: r.peso_precificado ? Number(r.peso_precificado) : null,
      preco_sync: r.preco_sync ? Number(r.preco_sync) : null,
      markup: r.markup ? Number(r.markup) : null,
      saldo: r.saldo,
      qtd_vendida_total: Number(r.qtd_vendida_total) || 0,
      qtd_vendas_distintas: r.qtd_vendas_distintas,
      receita_total: Number(r.receita_total) || 0,
      data_ultima_venda: r.data_ultima_venda ? (r.data_ultima_venda instanceof Date ? r.data_ultima_venda.toISOString() : String(r.data_ultima_venda)) : null,
      vendas_365d: r.vendas_365d,
      vendas_90d: r.vendas_90d,
    }));

    const totais = {
      qtd_skus: produtos.length,
      qtd_vendida_total_historica: produtos.reduce((a, p) => a + p.qtd_vendida_total, 0),
      receita_total_historica: produtos.reduce((a, p) => a + p.receita_total, 0),
    };

    return NextResponse.json({ produtos, totais });
  } catch (err) {
    console.error("[GET /api/gestao-estoque/oportunidades-fabricacao]", err);
    return NextResponse.json({ error: "Erro ao listar oportunidades" }, { status: 500 });
  }
}
