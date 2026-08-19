/**
 * GET /api/gestao-estoque/produtos
 * Retorna todos os produtos ATIVOS (pais+simples+variações) em UMA query,
 * com agregações pré-calculadas:
 *  - saldo_estoque     via JOIN com public.estoque (SKU)
 *  - qtd_vendas        total de vendas distintas do historico (legado + ERP)
 *  - data_ultima_venda MAX(data_venda) nas duas origens de venda
 *  - qtd_vendida_90d   soma de quantidade nos ultimos 90 dias (base do DIO)
 *  - receita_total_12m soma de preco_total nos ultimos 365 dias (base do ABC)
 *  - data_ultima_compra data de reposicao populada pelo ETL em public.produtos
 *
 * Vendas = itens_validos de src/lib/gestao-estoque/vendas-sql.ts (legado sem
 * canceladas + ERP nativo, com dedup) - correcao dos bugs graves n3 e n4
 * do pente-fino de 18/08/2026.
 *
 * SQL direto via postgres lib. Retorno integral usado pelo Dashboard analítico.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql, { normalizeRow } from "@/lib/db";
import { itensVendaValidos } from "@/lib/gestao-estoque/vendas-sql";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const localId = new URL(req.url).searchParams.get("local_id");
  const localIdNum = localId ? parseInt(localId, 10) : null;

  // Detecta se migration 140 foi aplicada (view v2 disponível)
  const [v2Exists] = await sql`
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'alissonerp'
      AND table_name = 'vw_saldo_estoque_comercial_v2'
    LIMIT 1
  `;

  try {
    const rows = await sql`
      WITH estoque_comercial AS (
        ${v2Exists
          ? (localIdNum
              ? sql`SELECT produto_id, saldo_fisico::int FROM alissonerp.vw_saldo_estoque_comercial_v2 WHERE local_estoque_id = ${localIdNum}`
              : sql`SELECT produto_id, SUM(saldo_fisico)::int AS saldo_fisico FROM alissonerp.vw_saldo_estoque_comercial_v2 GROUP BY produto_id`)
          : sql`SELECT produto_id, saldo::int AS saldo_fisico FROM alissonerp.vw_saldo_estoque_comercial`
        }
      ),
      itens_validos AS (
        -- Fonte unica de vendas contaveis: legado sem canceladas + ERP nativo,
        -- com dedup de espelhos. NUNCA voltar a ler so public.itens_venda aqui
        -- (bugs graves n3/n4 do pente-fino 18/08). Ver vendas-sql.ts.
        ${itensVendaValidos()}
      ),
      ultima_venda AS (
        SELECT
          produto_id,
          MAX(data_venda)                AS data_ultima_venda,
          COUNT(DISTINCT venda_key)::int AS qtd_vendas
        FROM itens_validos
        GROUP BY produto_id
      ),
      vendas_90d AS (
        -- Quantidade vendida nos ultimos 90 dias (base do calculo de DIO)
        SELECT
          produto_id,
          SUM(quantidade)::numeric AS qtd_vendida_90d
        FROM itens_validos
        WHERE data_venda >= (CURRENT_DATE - INTERVAL '90 days')
        GROUP BY produto_id
      ),
      receita_12m AS (
        -- Receita total nos ultimos 12 meses (base real da classificacao ABC)
        SELECT
          produto_id,
          SUM(preco_total)::numeric AS receita_total_12m
        FROM itens_validos
        WHERE data_venda >= (CURRENT_DATE - INTERVAL '365 days')
        GROUP BY produto_id
      )
      SELECT
        p.id_produto,
        p.nome,
        p.sku,
        p.tipo_metal,
        -- Peso da FONTE (alissonerp.erp_produtos) — mesma regra do /api/produtos:
        -- o espelho public.produtos so replica INSERT, nao UPDATE.
        COALESCE(ep.peso_precificado, p.peso_precificado) AS peso_precificado,
        p.preco_tiny,
        p.preco_sync,
        p.preco_total_sync,
        p.preco_pedras,
        p.diferenca_percentual,
        p.tem_pedra_preciosa,
        p.situacao,
        p.categoria,
        p.categoria_precificacao,
        p.markup,
        p.fator,
        -- Ficha propria do ERP (alissonerp.erp_produtos): fornecedor habilita o
        -- filtro de Fornecedor da tela; pai/variacao contextualiza a peca.
        ep.fornecedor,
        ep.eh_pai,
        ep.eh_variacao,
        ep.parent_sku,
        ep.numeracao,
        ep.cor_metal,
        vc.url_capa               AS imagem_capa,
        COALESCE(ec.saldo_fisico, 0)::int AS saldo_estoque,
        COALESCE(ec.saldo_fisico, 0)::int AS estoque,
        uv.data_ultima_venda,
        COALESCE(uv.qtd_vendas, 0)::int AS qtd_vendas,
        COALESCE(v90.qtd_vendida_90d, 0)::numeric AS qtd_vendida_90d,
        COALESCE(r12.receita_total_12m, 0)::numeric AS receita_total_12m,
        p.data_ultima_compra      AS data_ultima_compra,
        p.data_ultima_compra      AS ultima_compra,
        -- Promocao vigente (migration 248). preco_tiny do produto continua intacto.
        vpv.preco_vigente,
        vpv.em_promocao,
        vpv.promocao_id,
        vpv.nome_campanha,
        vpv.data_fim              AS promo_data_fim,
        cpa.markup_aplicado,
        cpa.comissao_pct,
        cpa.max_desconto_pct,
        cpa.updated_at            AS curva_aplicada_em,
        -- preco_curva pela view unificada vw_produtos_geral_preco — MESMA fonte
        -- do /api/produtos (regra 28/05/2026). A formula inline anterior podia
        -- divergir do preco oficial exibido na tela de Produtos.
        pp.preco_venda::int       AS preco_curva
      FROM public.produtos p
      LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
      LEFT JOIN estoque_comercial ec  ON ec.produto_id = p.id_produto
      LEFT JOIN ultima_venda uv       ON uv.produto_id = p.id_produto
      LEFT JOIN vendas_90d v90        ON v90.produto_id = p.id_produto
      LEFT JOIN receita_12m r12       ON r12.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produto_preco_vigente vpv ON vpv.id_produto = p.id_produto
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produtos_geral_preco pp ON pp.id_produto = p.id_produto
      WHERE p.situacao = 'A'
    `;

    // postgres.js devolve NUMERIC como STRING; sem normalizar, a matriz ordenava
    // alfabeticamente ('9.5' > '10') e a promo riscada nunca renderizava
    // (typeof val === 'number' falhava). Normaliza UMA vez aqui, no servidor.
    const NUMERICOS = [
      "peso_precificado", "preco_tiny", "preco_sync", "preco_total_sync",
      "preco_pedras", "diferenca_percentual", "markup", "fator",
      "qtd_vendida_90d", "receita_total_12m", "preco_vigente",
      "markup_aplicado", "comissao_pct", "max_desconto_pct",
    ];
    const produtos = rows.map((r) => normalizeRow(r, NUMERICOS));
    return NextResponse.json({ produtos, total: produtos.length });
  } catch (err) {
    console.error("[GET /api/gestao-estoque/produtos]", err);
    return NextResponse.json({ error: "Erro ao buscar produtos" }, { status: 500 });
  }
}
