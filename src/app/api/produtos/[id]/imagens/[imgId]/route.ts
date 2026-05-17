/**
 * PATCH  /api/produtos/[id]/imagens/[imgId] — body: { eh_capa?, ordem? }
 * DELETE /api/produtos/[id]/imagens/[imgId] — remove do bucket + DB; promove próxima como capa se necessário
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { deleteFile } from "@/lib/storage";
import { internalError } from "@/lib/api-error";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imgId: string }> }
) {
  const { id, imgId } = await params;
  const produtoId = Number(id);
  const imagemId = Number(imgId);
  if (!produtoId || !imagemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { eh_capa, ordem } = body;

    await sql.begin(async (tx: any) => {
      // confirma que a imagem é desse produto
      const [img] = await tx<{ id: number }[]>`
        SELECT id FROM alissonerp.produto_imagens
         WHERE id = ${imagemId} AND produto_id = ${produtoId}
      `;
      if (!img) throw new Error("Imagem não pertence ao produto");

      if (eh_capa === true) {
        await tx`UPDATE alissonerp.produto_imagens SET eh_capa = false WHERE produto_id = ${produtoId} AND eh_capa = true`;
        await tx`UPDATE alissonerp.produto_imagens SET eh_capa = true  WHERE id = ${imagemId}`;
      } else if (eh_capa === false) {
        await tx`UPDATE alissonerp.produto_imagens SET eh_capa = false WHERE id = ${imagemId}`;
      }

      if (typeof ordem === "number") {
        await tx`UPDATE alissonerp.produto_imagens SET ordem = ${ordem} WHERE id = ${imagemId}`;
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[PATCH /api/produtos/[id]/imagens/[imgId]]", err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imgId: string }> }
) {
  const { id, imgId } = await params;
  const produtoId = Number(id);
  const imagemId = Number(imgId);
  if (!produtoId || !imagemId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const [img] = await sql<{ bucket: string; bucket_path: string; eh_capa: boolean }[]>`
      SELECT bucket, bucket_path, eh_capa
        FROM alissonerp.produto_imagens
       WHERE id = ${imagemId} AND produto_id = ${produtoId}
    `;
    if (!img) return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });

    // só apaga do bucket se foi upload do ERP (origem != 'directus' tem bucket_path próprio,
    // mas mesmo as do directus foram copiadas pra cá — sempre apaga)
    await deleteFile(img.bucket, img.bucket_path);

    await sql.begin(async (tx: any) => {
      await tx`DELETE FROM alissonerp.produto_imagens WHERE id = ${imagemId}`;
      // se era capa, promover a próxima (menor ordem)
      if (img.eh_capa) {
        const [next] = await tx<{ id: number }[]>`
          SELECT id FROM alissonerp.produto_imagens
           WHERE produto_id = ${produtoId}
           ORDER BY ordem ASC LIMIT 1
        `;
        if (next) {
          await tx`UPDATE alissonerp.produto_imagens SET eh_capa = true WHERE id = ${next.id}`;
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[DELETE /api/produtos/[id]/imagens/[imgId]]", err);
  }
}
