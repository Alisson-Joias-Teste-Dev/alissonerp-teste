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
    ids_do_inventario AS (
      SELECT p.id_api_produto
      FROM alissonerp.itens_inventario_comercial ii
      JOIN public.produtos p ON p.id_produto = ii.produto_id
      WHERE ii.inventario_id = ${invId}
        AND p.id_api_produto IS NOT NULL
    )
    SELECT
      el.id_api_produto,
      p.sku,
      p.nome AS nome_produto,
      COALESCE(p.categoria, '') AS categoria_produto,
      COUNT(*)::int AS quantidade
    FROM epcs_lidos el
    JOIN public.produtos p ON p.id_api_produto = el.id_api_produto
    WHERE el.id_api_produto IS NOT NULL
      AND el.id_api_produto NOT IN (SELECT id_api_produto FROM ids_do_inventario)
    GROUP BY el.id_api_produto, p.sku, p.nome, p.categoria
    ORDER BY p.sku
  `;

  return NextResponse.json({ inventario, itens, leituras, total_leituras, excedentesForaInventario });
}
