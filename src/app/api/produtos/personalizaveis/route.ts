import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/produtos/personalizaveis?q=TEXTO&limit=50
 *
 * Lista produtos que possuem config ativa de personalizacao.
 * Usado pelo chip "Personalizado" no catalogo/wizard de venda.
 *
 * Params (todos opcionais):
 *   q     — busca por sku OR nome (min 2 chars p/ aplicar)
 *   limit — default 50, max 100
 *
 * Response 200:
 *   Array<{
 *     id_produto, sku, nome, categoria, qtd_estoque,
 *     max_caracteres, tipo, obrigatorio
 *   }>
 *
 * Errors: 401 nao autenticado, 500 erro interno
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q          = searchParams.get("q")?.trim() ?? "";
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit      = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 50, 100));
  const aplicaQ    = q.length >= 2;

  try {
    const rows = aplicaQ
      ? await sql`
          SELECT
            p.id_produto,
            p.sku,
            p.nome,
            p.categoria,
            p.qtd_estoque,
            pp.max_caracteres,
            pp.min_caracteres,
            pp.tipo,
            pp.obrigatorio,
            pp.preco_por_letra,
            pp.peso_por_letra,
            pp.label
          FROM alissonerp.produtos_compat p
          JOIN alissonerp.produto_personalizacao pp ON pp.produto_id = p.id_produto
          WHERE pp.ativo = true
            AND p.situacao = 'A'
            AND (p.nome ILIKE ${"%" + q + "%"} OR p.sku ILIKE ${"%" + q + "%"})
          ORDER BY p.nome ASC
          LIMIT ${limit}
        `
      : await sql`
          SELECT
            p.id_produto,
            p.sku,
            p.nome,
            p.categoria,
            p.qtd_estoque,
            pp.max_caracteres,
            pp.min_caracteres,
            pp.tipo,
            pp.obrigatorio,
            pp.preco_por_letra,
            pp.peso_por_letra,
            pp.label
          FROM alissonerp.produtos_compat p
          JOIN alissonerp.produto_personalizacao pp ON pp.produto_id = p.id_produto
          WHERE pp.ativo = true
            AND p.situacao = 'A'
          ORDER BY p.nome ASC
          LIMIT ${limit}
        `;

    return NextResponse.json(
      rows.map((r) => ({
        id_produto:      Number(r.id_produto),
        sku:             r.sku as string | null,
        nome:            r.nome as string | null,
        categoria:       r.categoria as string | null,
        qtd_estoque:     r.qtd_estoque != null ? Number(r.qtd_estoque) : 0,
        max_caracteres:  Number(r.max_caracteres),
        min_caracteres:  Number(r.min_caracteres),
        tipo:            r.tipo as string,
        obrigatorio:     Boolean(r.obrigatorio),
        preco_por_letra: r.preco_por_letra != null ? Number(r.preco_por_letra) : null,
        peso_por_letra:  r.peso_por_letra  != null ? Number(r.peso_por_letra)  : null,
        label:           r.label as string,
      })),
    );
  } catch (err) {
    console.error("[GET /api/produtos/personalizaveis]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
