/**
 * GET /api/produtos/[id]/variacoes
 *
 * Retorna variações ativas de um produto pai.
 * Usado pelo modal de Reposição Loja para exibir o checklist de variações.
 *
 * Resposta:
 *   { variacoes: Variacao[], produto_pai: { nome, sku } }
 *
 * - Se produto não existir em erp_produtos ou não for pai → variacoes: []
 * - Ordena por sufixo numérico (tam. 14, 15, 16...) ou alfabético
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId || isNaN(produtoId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Verificar existência do produto em public.produtos
  const [produto] = await sql`
    SELECT id_produto, nome, sku
    FROM public.produtos
    WHERE id_produto = ${produtoId}
    LIMIT 1
  `;
  if (!produto) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  // Verificar se é pai em erp_produtos
  const [erpProduto] = await sql`
    SELECT id, eh_pai
    FROM alissonerp.erp_produtos
    WHERE produto_id = ${produtoId}
    LIMIT 1
  `;

  // Não está em erp_produtos, ou é variação/simples → sem variações
  if (!erpProduto?.eh_pai) {
    return NextResponse.json({
      variacoes: [],
      produto_pai: { nome: produto.nome as string, sku: produto.sku as string },
    });
  }

  // Buscar variações ativas, ordenadas por sufixo numérico
  const variacoes = await sql`
    SELECT
      p.id_produto,
      p.nome,
      COALESCE(erpv.sku, p.sku) AS sku,
      COALESCE(erpv.peso_precificado, p.peso_precificado) AS peso_precificado,
      COALESCE(erpv.tipo_metal, p.tipo_metal) AS tipo_metal,
      ep.sufixo_variacao,
      ep.numeracao
    FROM alissonerp.erp_produtos ep
    JOIN public.produtos p ON p.id_produto = ep.produto_id
    LEFT JOIN alissonerp.erp_produtos erpv ON erpv.produto_id = p.id_produto
    WHERE ep.parent_id = ${erpProduto.id as number}
      AND p.situacao = 'A'
    ORDER BY
      NULLIF(regexp_replace(ep.sufixo_variacao, '[^0-9]', '', 'g'), '')::integer NULLS LAST,
      ep.sufixo_variacao ASC NULLS LAST
  `;

  return NextResponse.json({
    variacoes,
    produto_pai: { nome: produto.nome as string, sku: produto.sku as string },
  });
}
