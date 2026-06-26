/**
 * POST /api/produtos/sync-public-to-erp
 *
 * Sincroniza produtos ATIVOS de public.produtos que ainda não existem em
 * alissonerp.erp_produtos. Detecta pai/variação pelo padrão SKU:
 *   - "1459-8"  → variação (parent_sku="1459", sufixo="8")
 *   - "1459"    → simples/pai
 *
 * Fluxo:
 *   1. Lista produtos ativos sem entrada em erp_produtos
 *   2. INSERT em 1 query usando UNNEST (batch)
 *   3. UPDATE parent_id = id do pai (resolvido por parent_sku)
 *   4. UPDATE eh_pai=true nos SKUs simples que têm variações filhas
 *
 * Permissão: isFullAccess
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { internalError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const t0 = Date.now();
  try {
    // 1) Produtos ativos faltando — exclui SKUs que já existem em erp_produtos
    //    (proteção contra duplicatas de SKU vinculadas a produto_id diferente).
    //    Também deduplica dentro do próprio resultado (mantém o menor id_produto).
    const faltando = (await sql`
      SELECT DISTINCT ON (p.sku)
        p.id_produto, p.sku, p.nome
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep_by_id  ON ep_by_id.produto_id = p.id_produto
      LEFT JOIN alissonerp.erp_produtos ep_by_sku ON ep_by_sku.sku = p.sku
      WHERE p.situacao = 'A'
        AND ep_by_id.id IS NULL
        AND ep_by_sku.id IS NULL
        AND p.sku IS NOT NULL AND TRIM(p.sku) <> ''
      ORDER BY p.sku, p.id_produto
    `) as unknown as Array<{ id_produto: string | number; sku: string; nome: string | null }>;

    if (faltando.length === 0) {
      return NextResponse.json({ ok: true, inseridos: 0, elapsed_s: "0.0", mensagem: "Nada a sincronizar." });
    }

    // 2) Montar arrays paralelos (detecta variação por regex "base-sufixo")
    const varRegex = /^(.+)-([0-9]+)$/;
    const ids: number[]        = [];
    const skus: string[]       = [];
    const nomes: (string | null)[] = [];
    const parentSkus: (string | null)[] = [];
    const ehVariacoes: number[] = []; // 0/1 (postgres.js tem atrito com boolean[])
    const sufixos: (string | null)[] = [];

    for (const p of faltando) {
      const sku = String(p.sku).trim();
      const m = sku.match(varRegex);
      ids.push(Number(p.id_produto));
      skus.push(sku);
      nomes.push(p.nome);
      if (m) {
        parentSkus.push(m[1]);
        ehVariacoes.push(1);
        sufixos.push(m[2]);
      } else {
        parentSkus.push(null);
        ehVariacoes.push(0);
        sufixos.push(null);
      }
    }

    // 3) INSERT em batch (UNNEST)
    const ins = await sql`
      INSERT INTO alissonerp.erp_produtos
        (produto_id, sku, nome, parent_sku, eh_variacao, eh_pai, sufixo_variacao, ativo)
      SELECT t.produto_id, t.sku, t.nome, t.parent_sku, t.eh_variacao::int::boolean, false, t.sufixo, true
      FROM UNNEST(
        ${ids}::bigint[],
        ${skus}::text[],
        ${nomes}::text[],
        ${parentSkus}::text[],
        ${ehVariacoes}::int[],
        ${sufixos}::text[]
      ) AS t(produto_id, sku, nome, parent_sku, eh_variacao, sufixo)
      ON CONFLICT (produto_id) DO NOTHING
      RETURNING id
    `;

    // 4) Resolver parent_id: para cada variação nova, busca o pai por parent_sku
    const parentResolved = await sql`
      UPDATE alissonerp.erp_produtos v
      SET parent_id = pai.id
      FROM alissonerp.erp_produtos pai
      WHERE v.eh_variacao = true
        AND v.parent_id IS NULL
        AND v.parent_sku IS NOT NULL
        AND pai.sku = v.parent_sku
        AND pai.eh_variacao = false
    `;

    // 5) Promover pais: quem tem variações filhas e ainda não é eh_pai
    const paisPromotidos = await sql`
      UPDATE alissonerp.erp_produtos pai
      SET eh_pai = true
      WHERE pai.eh_variacao = false
        AND pai.eh_pai = false
        AND EXISTS (
          SELECT 1 FROM alissonerp.erp_produtos filho
          WHERE filho.parent_id = pai.id OR filho.parent_sku = pai.sku
        )
    `;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      inseridos: ins.length,
      variacoes_com_parent_id: parentResolved.count ?? 0,
      pais_promotidos: paisPromotidos.count ?? 0,
      elapsed_s: elapsed,
    });
  } catch (err) {
    return internalError("[POST /api/produtos/sync-public-to-erp]", err);
  }
}
