/**
 * GET /api/v1/produtos/:id
 *
 * Detalhe completo de um produto — requer X-API-Key header.
 * Inclui fotos (array), composição resumida e variações se houver.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { autenticarApiKey, apiResponse } from "@/lib/api-publica";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await autenticarApiKey(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const produtoId = Number(id);
  if (isNaN(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // ── Produto ───────────────────────────────────────────────────────────────────
  const [produto] = await sql`
    SELECT
      p.id_produto                        AS id,
      p.nome,
      p.sku,
      p.situacao,
      p.tipo_metal,
      p.peso_precificado                  AS peso,
      p.preco_tiny                        AS preco,
      p.preco_total_sync                  AS preco_com_pedras,
      p.preco_pedras,
      p.tem_pedra_preciosa,
      vc.url_capa                         AS foto,
      COALESCE(vi.imagens, '[]'::jsonb)   AS imagens,
      p.categoria                         AS categoria,
      p.categoria_precificacao            AS categoria_precificacao,
      p.markup,
      p.updated_at,
      -- Variações (filhos) se for produto pai
      ep.eh_pai,
      ep.eh_variacao,
      ep.parent_sku,
      ep.numeracao,
      ep.cor_metal,
      ep.comprimento,
      ep.largura_aro,
      ep.observacao_erp
    FROM alissonerp.produtos_compat p
    LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
    LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    WHERE p.id_produto = ${produtoId}
  `;

  if (!produto) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // ── Variações (se for pai) ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let variacoes: any[] = [];
  if (produto.eh_pai) {
    variacoes = Array.from(await sql`
      SELECT
        p.id_produto  AS id,
        p.nome,
        p.sku,
        p.situacao,
        p.preco_tiny  AS preco,
        ep.numeracao,
        ep.cor_metal
      FROM alissonerp.erp_produtos ep
      JOIN alissonerp.produtos_compat p ON p.id_produto = ep.produto_id
      WHERE ep.parent_sku = ${produto.sku} AND ep.eh_variacao = true
      ORDER BY ep.numeracao ASC
    `);
  }

  // ── Composição resumida ───────────────────────────────────────────────────────
  const composicao = await sql`
    SELECT
      pc.insumo_nome  AS item,
      pc.quantidade,
      pc.unidade
    FROM alissonerp.produto_composicao pc
    WHERE pc.produto_id = ${produtoId}
    ORDER BY pc.insumo_nome ASC
  `;

  return apiResponse({ ...produto, variacoes, composicao });
}
