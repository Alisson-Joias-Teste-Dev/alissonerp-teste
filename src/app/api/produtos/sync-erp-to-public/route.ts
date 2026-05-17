/**
 * POST /api/produtos/sync-erp-to-public
 *
 * Sincroniza produtos de alissonerp.erp_produtos para public.produtos.
 * O trigger trg_sync_erp_to_public_produto já faz isso automaticamente,
 * este endpoint serve como reconciliação/backfill manual.
 *
 * Fluxo:
 *   1. Lista produtos em erp_produtos que não existem em public.produtos
 *   2. INSERT em batch usando UNNEST
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
    const result = await sql`
      INSERT INTO public.produtos (id_produto, sku, nome, situacao, tipo, unidade)
      SELECT e.produto_id, COALESCE(e.sku, ''), COALESCE(e.nome, ''),
             CASE WHEN e.ativo THEN 'A' ELSE 'I' END, 'S', 'UN'
      FROM alissonerp.erp_produtos e
      LEFT JOIN public.produtos p ON p.id_produto = e.produto_id
      WHERE p.id_produto IS NULL
      ON CONFLICT (id_produto) DO NOTHING
      RETURNING id_produto, sku, nome
    `;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      sincronizados: result.length,
      elapsed_s: elapsed,
      produtos: result.map(r => ({ id_produto: r.id_produto, sku: r.sku, nome: r.nome })),
    });
  } catch (err) {
    return internalError("[POST /api/produtos/sync-erp-to-public]", err);
  }
}
