/**
 * GET /api/produtos/insumos
 * Lista insumos para uso no BOM (produto_composicao).
 * Retorna id, descricao (=nome), unidade, categoria_id, peso_pedra,
 *         ultimo_preco_compra_usd, data_ultimo_preco de alissonerp.insumos.
 * Query param: categoria_id (opcional) — filtra por categoria
 *
 * PATCH /api/produtos/insumos
 * Atualiza ultimo_preco_compra_usd de um insumo.
 * Body: { insumo_id, preco_compra_usd }
 * O trigger trg_propagar_preco_insumo propaga o preço para produto_composicao.
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const categoriaId = sp.get("categoria_id");

  try {
    // NOTA: ultimo_preco_compra_usd e data_ultimo_preco só existem após migration 061.
    // Usar COALESCE para não falhar se a migration ainda não foi aplicada.
    const insumos = categoriaId
      ? await sql`
          SELECT id,
                 nome AS descricao,
                 unidade,
                 categoria_id,
                 peso_pedra,
                 NULL::numeric AS ultimo_preco_compra_usd,
                 NULL::timestamptz AS data_ultimo_preco
          FROM alissonerp.insumos
          WHERE ativo = true AND nome IS NOT NULL AND nome != '' AND categoria_id = ${parseInt(categoriaId)}
          ORDER BY nome
        `
      : await sql`
          SELECT id,
                 nome AS descricao,
                 unidade,
                 categoria_id,
                 peso_pedra,
                 NULL::numeric AS ultimo_preco_compra_usd,
                 NULL::timestamptz AS data_ultimo_preco
          FROM alissonerp.insumos
          WHERE ativo = true AND nome IS NOT NULL AND nome != ''
          ORDER BY categoria_id, nome
        `;

    return NextResponse.json({ insumos });
  } catch (err) {
    console.error("[GET /api/produtos/insumos]", err);
    return NextResponse.json({ error: "Erro ao buscar insumos" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json() as { insumo_id?: number; preco_compra_usd?: number };
    const { insumo_id, preco_compra_usd } = body;

    if (!insumo_id || preco_compra_usd === undefined || preco_compra_usd === null) {
      return NextResponse.json({ error: "insumo_id e preco_compra_usd são obrigatórios" }, { status: 400 });
    }

    // Atualizar último preço de compra — trigger propaga para produto_composicao
    await sql`
      UPDATE alissonerp.insumos
      SET ultimo_preco_compra_usd = ${preco_compra_usd},
          data_ultimo_preco = NOW()
      WHERE id = ${insumo_id}
    `;

    // Recalcular preços dos produtos afetados (tipo='pedra' no BOM que usam este insumo)
    const produtosAfetados = await sql<{ produto_id: number }[]>`
      SELECT DISTINCT produto_id
      FROM alissonerp.produto_composicao
      WHERE insumo_id = ${insumo_id}
        AND tipo = 'pedra'
    `;

    const resultados: Array<{ produto_id: number; preco_pedras: number }> = [];
    for (const { produto_id } of produtosAfetados) {
      const preco_pedras = await recalcularPrecoPedras(produto_id);
      resultados.push({ produto_id, preco_pedras });
    }

    return NextResponse.json({
      ok: true,
      insumo_id,
      preco_compra_usd,
      produtos_recalculados: resultados.length,
      resultados,
    });
  } catch (err) {
    console.error("[PATCH /api/produtos/insumos]", err);
    return NextResponse.json({ error: "Erro ao atualizar preço" }, { status: 500 });
  }
}
