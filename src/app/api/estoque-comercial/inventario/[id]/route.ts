import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLES_INVENTARIO_VER, hasRole } from "@/lib/roles";
import { condPecaPronta } from "@/lib/inventario-peca-pronta";

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/estoque-comercial/inventario/[id]
 *
 * O QUÊ: detalhe do inventário — cabeçalho, itens (com pendências),
 *   leituras RFID e chips lidos fora do escopo.
 * POR QUÊ da restrição de role: quantidades do estoque comercial (milhões
 *   em joias) não podem ficar visíveis para qualquer usuário logado
 *   (motoboy, ourives, consultora não precisam disso).
 * IMPACTO SE ALTERADO: remover o check de role expõe o estoque inteiro.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!hasRole(user.role, ROLES_INVENTARIO_VER)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);
  if (!Number.isInteger(invId) || invId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [inventario] = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.obs, i.categoria, i.data_abertura, i.data_conclusao,
      i.motivo_cancelamento,
      uc.email AS criado_por_email,
      uf.email AS concluido_por_email,
      ux.email AS cancelado_por_email
    FROM alissonerp.inventarios_comercial i
    LEFT JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = i.created_by
    LEFT JOIN auth.users uf ON uf.id = i.concluido_por
    LEFT JOIN auth.users ux ON ux.id = i.cancelado_por
    WHERE i.id = ${invId}
  `;
  if (!inventario) return NextResponse.json({ error: "Inventario nao encontrado" }, { status: 404 });

  const url = new URL(req.url);
  const soDivergentes = url.searchParams.get("divergentes") === "true";

  const itens = await sql`
    SELECT
      ii.id, ii.produto_id, ii.quantidade_sistema, ii.quantidade_contada, ii.diferenca,
      ii.conferido, ii.contado_em, ii.movimento_ajuste_id,
      ii.pendencia_obs, ii.pendencia_registrada_em,
      ii.pendencia_resolvida, ii.pendencia_resolucao_obs, ii.pendencia_resolvida_em,
      ii.pendencia_desfecho_tipo, ii.pendencia_desfecho_venda_id,
      vd.numero_venda AS pendencia_desfecho_numero_venda,
      p.nome AS nome_produto, p.sku, COALESCE(p.categoria, '') AS categoria_produto,
      uc.email AS contado_por_email,
      ur.email AS pendencia_registrada_por_email,
      uz.email AS pendencia_resolvida_por_email
    FROM alissonerp.itens_inventario_comercial ii
    LEFT JOIN alissonerp.produtos_compat p ON p.id_produto = ii.produto_id
    LEFT JOIN auth.users uc ON uc.id = ii.contado_por
    LEFT JOIN auth.users ur ON ur.id = ii.pendencia_registrada_por
    LEFT JOIN auth.users uz ON uz.id = ii.pendencia_resolvida_por
    LEFT JOIN alissonerp.vendas_erp vd ON vd.id = ii.pendencia_desfecho_venda_id
    WHERE ii.inventario_id = ${invId}
      -- PEÇA PRONTA: pedra solta/personalizada nunca aparecem na auditoria
      -- (vale também para inventário aberto ANTES da regra — filtro na leitura)
      AND ${condPecaPronta(sql)}
      ${soDivergentes ? sql`AND ii.diferenca != 0` : sql``}
    ORDER BY
      CASE WHEN ii.quantidade_contada IS NULL THEN 0 ELSE 1 END,
      p.nome
  `;

  // Total REAL de leituras (a lista abaixo é limitada a 200 para a tela)
  const [{ total_leituras }] = await sql`
    SELECT COUNT(*)::int AS total_leituras
    FROM alissonerp.joias_leituras
    WHERE inventario_id = ${invId}
  `;

  const leituras = await sql`
    SELECT epc, evento, lido_em, operador::text AS operador
    FROM alissonerp.joias_leituras
    WHERE inventario_id = ${invId}
    ORDER BY lido_em DESC
    LIMIT 200
  `;

  // Chips lidos pelo app que nao estao no escopo do inventario
  const excedentesForaInventario = await sql`
    WITH epcs_lidos AS (
      SELECT DISTINCT epc,
        CASE
          WHEN epc ~ '^[0-9]{24}$'
          THEN CAST(SUBSTRING(epc FROM 5 FOR 9) AS BIGINT)
          ELSE NULL
        END AS id_api_produto
      FROM alissonerp.joias_leituras
      WHERE inventario_id = ${invId}
    ),
    -- REGRA DE NEGÓCIO (11/07 — Jonathan): resolve o id_api_produto pela
    -- erp_produtos (via produtos_compat) ALÉM da public.produtos. Sem isso, uma
    -- peça com id só na erp (public.id_api = NULL por causa do espelho que só
    -- propaga INSERT) ficava FORA de ids_do_inventario e suas leituras apareciam
    -- como "excedente fora do inventário" (falso — a peça ESTÁ no inventário).
    ids_do_inventario AS (
      SELECT COALESCE(pc.id_api_produto, p.id_api_produto) AS id_api_produto
      FROM alissonerp.itens_inventario_comercial ii
      JOIN public.produtos p ON p.id_produto = ii.produto_id
      LEFT JOIN alissonerp.produtos_compat pc ON pc.id_produto = ii.produto_id
      WHERE ii.inventario_id = ${invId}
        AND COALESCE(pc.id_api_produto, p.id_api_produto) IS NOT NULL
    ),
    -- Fonte de produto por id_api resolvendo as duas tabelas (erp primeiro).
    -- Onde as duas têm, o número é idêntico (0 divergência em 15.546 casos).
    prod_por_api AS (
      SELECT DISTINCT ON (id_api_produto) id_api_produto, sku, nome, categoria
      FROM (
        SELECT id_api_produto, sku, nome, categoria, 1 AS pri
          FROM alissonerp.produtos_compat WHERE id_api_produto IS NOT NULL
        UNION ALL
        SELECT id_api_produto, sku, nome, categoria, 2 AS pri
          FROM public.produtos WHERE id_api_produto IS NOT NULL
      ) u
      ORDER BY id_api_produto, pri
    )
    SELECT
      el.id_api_produto,
      p.sku,
      p.nome AS nome_produto,
      COALESCE(p.categoria, '') AS categoria_produto,
      COUNT(*)::int AS quantidade,
      -- Números dos chips lidos deste produto fora do inventário (mesmo dado do
      -- drill-down dos itens de dentro, agora exposto também para os de fora).
      array_agg(el.epc ORDER BY el.epc) AS epcs
    FROM epcs_lidos el
    JOIN prod_por_api p ON p.id_api_produto = el.id_api_produto
    WHERE el.id_api_produto IS NOT NULL
      AND el.id_api_produto NOT IN (SELECT id_api_produto FROM ids_do_inventario)
    GROUP BY el.id_api_produto, p.sku, p.nome, p.categoria
    ORDER BY p.sku
  `;

  // O QUÊ: liga cada CHIP (EPC) lido à PEÇA/produto do inventário (produto_id -> [epc,...]).
  // POR QUÊ: ao abrir uma divergência a tela mostra o número do chip de cada peça lida —
  //   o dado já existe em joias_leituras; aqui só AGRUPAMOS por produto (100% leitura).
  // COMO: o EPC de 24 dígitos carrega o id_api_produto nos dígitos 5-13; o id_api do item
  //   é resolvido pela erp (produtos_compat) OU public, igual ao cálculo dos excedentes acima.
  //   Agrupar por produto evita despejar milhares de EPCs soltos (o LIMIT 200 das leituras
  //   não afeta isto — o mapa vem completo).
  // IMPACTO SE ALTERADO/REMOVIDO: o drill-down "peça N · chip …" fica sem os números.
  const epcsPorProdutoRows = await sql`
    WITH epcs_lidos AS (
      SELECT epc,
        CASE
          WHEN epc ~ '^[0-9]{24}$'
          THEN CAST(SUBSTRING(epc FROM 5 FOR 9) AS BIGINT)
          ELSE NULL
        END AS id_api_produto
      FROM alissonerp.joias_leituras
      WHERE inventario_id = ${invId}
    ),
    item_api AS (
      SELECT ii.produto_id,
             COALESCE(pc.id_api_produto, p.id_api_produto) AS id_api_produto
      FROM alissonerp.itens_inventario_comercial ii
      JOIN public.produtos p ON p.id_produto = ii.produto_id
      LEFT JOIN alissonerp.produtos_compat pc ON pc.id_produto = ii.produto_id
      WHERE ii.inventario_id = ${invId}
        AND COALESCE(pc.id_api_produto, p.id_api_produto) IS NOT NULL
    )
    SELECT ia.produto_id,
           array_agg(el.epc ORDER BY el.epc) AS epcs
    FROM item_api ia
    JOIN epcs_lidos el ON el.id_api_produto = ia.id_api_produto
    WHERE el.id_api_produto IS NOT NULL
    GROUP BY ia.produto_id
  `;
  // produto_id -> [epc, ...] — mapa enxuto para o front montar "peça N · chip …"
  const epcsPorProduto: Record<number, string[]> = {};
  for (const r of epcsPorProdutoRows) {
    epcsPorProduto[Number(r.produto_id)] = (r.epcs as string[]) ?? [];
  }

  // -- VALORES (restrito): valor de venda x peso da FONTE, por SKU + total geral --
  // POR QUE: cifras do estoque comercial (milhoes) so para desenvolvedor e o dono.
  //   BLINDAGEM: gate no BACKEND -- para quem nao pode, `valores` nem vai no JSON
  //   (esconder so no front vazaria pela resposta da API).
  const EMAIL_DONO = "alisson@alissonjoias.com.br";
  const podeVerValores = user.role === "desenvolvedor" || user.email === EMAIL_DONO;

  let valores: {
    itens: {
      produto_id: number; sku: string | null; nome_produto: string;
      quantidade_sistema: number; quantidade_contada: number | null;
      valor_unitario: number; peso_unitario: number;
    }[];
    totais: { valor_esperado: number; valor_contado: number; peso_esperado: number; peso_contado: number };
  } | null = null;

  if (podeVerValores) {
    // valor_unitario = preco de venda (mesma view da tela de produtos)
    // peso_unitario  = peso da FONTE (erp_produtos), igual ao usado no preco
    // Mesmo filtro de PECA PRONTA dos itens: os totais batem com a lista exibida.
    const linhasValor = await sql`
      SELECT
        ii.produto_id,
        p.sku,
        p.nome AS nome_produto,
        ii.quantidade_sistema,
        ii.quantidade_contada,
        COALESCE(vpp.preco_venda, 0)::int         AS valor_unitario,
        COALESCE(ep.peso_precificado, 0)::float8  AS peso_unitario
      FROM alissonerp.itens_inventario_comercial ii
      LEFT JOIN alissonerp.produtos_compat p           ON p.id_produto = ii.produto_id
      LEFT JOIN alissonerp.vw_produtos_geral_preco vpp ON vpp.id_produto = ii.produto_id
      LEFT JOIN alissonerp.erp_produtos ep             ON ep.produto_id = ii.produto_id
      WHERE ii.inventario_id = ${invId}
        AND ${condPecaPronta(sql)}
      ORDER BY p.sku
    `;
    const totais = { valor_esperado: 0, valor_contado: 0, peso_esperado: 0, peso_contado: 0 };
    const itensValor = linhasValor.map(r => {
      const vu = Number(r.valor_unitario) || 0;
      const pu = Number(r.peso_unitario) || 0;
      const qs = Number(r.quantidade_sistema) || 0;
      const qc = r.quantidade_contada == null ? 0 : Number(r.quantidade_contada);
      totais.valor_esperado += qs * vu;
      totais.valor_contado  += qc * vu;
      totais.peso_esperado  += qs * pu;
      totais.peso_contado   += qc * pu;
      return {
        produto_id: Number(r.produto_id),
        sku: (r.sku as string | null) ?? null,
        nome_produto: (r.nome_produto as string) ?? "",
        quantidade_sistema: qs,
        quantidade_contada: r.quantidade_contada == null ? null : qc,
        valor_unitario: vu,
        peso_unitario: pu,
      };
    });
    valores = { itens: itensValor, totais };
  }

  return NextResponse.json({ inventario, itens, leituras, total_leituras, excedentesForaInventario, epcsPorProduto, valores });
}
