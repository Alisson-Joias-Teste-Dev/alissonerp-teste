import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/rfid/produto-preview?id=123
 *
 * Endpoint leve para exibir card de pre-visualizacao do produto na tela
 * de cadastro RFID. Retorna apenas os campos que o card precisa.
 *
 * Separado de /api/produtos/[id] porque aquele endpoint:
 *   - Exige role gerente_loja (restritivo para quem faz cadastro RFID)
 *   - Traz composicao + variacoes (overkill para um card simples)
 *
 * Response 200:
 *   {
 *     id_produto, sku, nome, categoria,
 *     peso_precificado, preco_tiny, imagem,
 *     tem_sku_e_nome   // true se esta pronto para gerar etiqueta
 *   }
 *
 * Errors:
 *   400 id invalido
 *   401 nao autenticado
 *   404 produto nao existe
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("id");
  const id  = raw != null && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  try {
    const [produto] = await sql`
      SELECT
        p.id_produto,
        p.sku,
        p.nome,
        p.categoria,
        p.peso_real,
        p.peso_precificado,
        pp.preco_venda AS preco,
        p.imagem
      FROM alissonerp.produtos_compat p
      LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
      WHERE p.id_produto = ${id}
    `;

    if (!produto) {
      return NextResponse.json({ error: "Produto nao encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id_produto:       Number(produto.id_produto),
      sku:              produto.sku,
      nome:             produto.nome,
      categoria:        produto.categoria,
      peso_real:        produto.peso_real != null ? Number(produto.peso_real) : null,
      peso_precificado: produto.peso_precificado != null ? Number(produto.peso_precificado) : null,
      preco:            produto.preco != null ? Number(produto.preco) : null,
      imagem:           produto.imagem,
      tem_sku_e_nome:   Boolean(produto.sku) && Boolean(produto.nome),
    });
  } catch (err) {
    console.error("[GET /api/rfid/produto-preview] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
