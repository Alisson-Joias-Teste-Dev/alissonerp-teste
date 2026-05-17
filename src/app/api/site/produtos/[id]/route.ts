/**
 * PATCH /api/site/produtos/[id]
 *
 * Toggle de "publicado_no_site" (e outros flags de integração) para um
 * produto. Cria o registro em alissonerp.site_produtos se ainda não existir.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const publicado = typeof body?.publicado_no_site === "boolean"
    ? body.publicado_no_site
    : null;

  if (publicado === null) {
    return NextResponse.json({ error: "publicado_no_site é obrigatório" }, { status: 400 });
  }

  try {
    if (!(await tabelaExiste("alissonerp", "site_produtos"))) {
      return NextResponse.json(
        { error: "Migration 159 pendente. Execute: node scripts/apply_159.mjs" },
        { status: 503 }
      );
    }

    // Resolve sku do produto (usado como chave de fallback no upsert)
    const [prod] = await sql<{ sku: string }[]>`
      SELECT sku FROM public.produtos WHERE id_produto = ${produtoId} LIMIT 1
    `;
    if (!prod) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    await sql`
      INSERT INTO alissonerp.site_produtos (produto_id, sku, publicado_no_site, status_sync)
      VALUES (${produtoId}, ${prod.sku}, ${publicado}, 'pendente')
      ON CONFLICT (produto_id) DO UPDATE SET
        publicado_no_site = EXCLUDED.publicado_no_site,
        -- Se voltou a publicar, marca como pendente pra próximo sync reenviar
        status_sync = CASE WHEN EXCLUDED.publicado_no_site = true THEN 'pendente'
                           ELSE alissonerp.site_produtos.status_sync END
    `;

    return NextResponse.json({ ok: true, produto_id: produtoId, publicado_no_site: publicado });
  } catch (err) {
    console.error("[PATCH /api/site/produtos/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar" },
      { status: 500 }
    );
  }
}
