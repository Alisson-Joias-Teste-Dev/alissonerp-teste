/**
 * GET  /api/produtos/[id]/imagens — lista imagens do produto (com fallback variação→pai)
 * POST /api/produtos/[id]/imagens — adiciona imagem (body: { foto_base64, filename? })
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { internalError } from "@/lib/api-error";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  LIMITS,
  checkBase64Length,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

const ImagensPostSchema = z.object({
  foto_base64: z.string().min(1, "foto_base64 inválido (esperado data URL)").max(LIMITS.IMAGE_BASE64_MAX),
  filename: z.string().max(LIMITS.NOME_MAX).optional(),
  eh_capa: z.boolean().optional(),
});

const BUCKET = "imagens";

type ImagemRow = {
  id: number;
  produto_id: number;
  bucket: string;
  bucket_path: string;
  url_publica: string;
  ordem: number;
  eh_capa: boolean;
  origem: string | null;
  origem_tabela: string | null;
  filename: string | null;
  mime_type: string | null;
  filesize: number | null;
  herdada: boolean;
};

export async function GET(
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

  try {
    // 1) imagens próprias
    const proprias = await sql<ImagemRow[]>`
      SELECT id, produto_id::int, bucket, bucket_path, url_publica, ordem, eh_capa,
             origem, origem_tabela, filename, mime_type, filesize::int,
             false AS herdada
        FROM alissonerp.produto_imagens
       WHERE produto_id = ${produtoId}
       ORDER BY eh_capa DESC, ordem ASC
    `;

    if (proprias.length > 0) {
      return NextResponse.json({ imagens: proprias, herdada_de: null });
    }

    // 2) fallback: se variação, buscar imagens do pai
    const [parent] = await sql<{ parent_id: number | null }[]>`
      SELECT parent_id FROM alissonerp.erp_produtos
       WHERE produto_id = ${produtoId} AND eh_variacao = true
    `;
    if (parent?.parent_id) {
      const doPai = await sql<ImagemRow[]>`
        SELECT id, produto_id::int, bucket, bucket_path, url_publica, ordem, eh_capa,
               origem, origem_tabela, filename, mime_type, filesize::int,
               true AS herdada
          FROM alissonerp.produto_imagens
         WHERE produto_id = ${parent.parent_id}
         ORDER BY eh_capa DESC, ordem ASC
      `;
      if (doPai.length > 0) {
        return NextResponse.json({ imagens: doPai, herdada_de: parent.parent_id });
      }
    }

    return NextResponse.json({ imagens: [], herdada_de: null });
  } catch (err) {
    return internalError("[GET /api/produtos/[id]/imagens]", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Upload de imagem (base64) — 10/min por user.
  try {
    rateLimit(`produto-imagem-upload:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = ImagensPostSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const { foto_base64: fotoBase64, filename: filenameOriginal, eh_capa } = parsed.data;
    const definirComoCapa = eh_capa === true;

    // Defesa em profundidade — zod ja limita, helper retorna 413 explicito.
    try {
      checkBase64Length("foto_base64", fotoBase64, LIMITS.IMAGE_BASE64_MAX);
      checkStringLength("filename", filenameOriginal, LIMITS.NOME_MAX);
    } catch (e) {
      const r = payloadTooLargeResponse(e);
      if (r) return r;
      throw e;
    }

    if (!fotoBase64.startsWith("data:")) {
      return NextResponse.json({ error: "foto_base64 inválido (esperado data URL)" }, { status: 400 });
    }
    const matches = fotoBase64.match(/^data:([^;]+);base64,/);
    const mimeType = matches?.[1] ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Apenas imagens são aceitas" }, { status: 400 });
    }
    const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";

    const uuid = randomUUID();
    const path = `produtos/${produtoId}/${uuid}.${ext}`;

    const uploaded = await uploadFile(BUCKET, path, fotoBase64, mimeType);
    if ("error" in uploaded) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }

    const filesize = Buffer.from(fotoBase64.replace(/^data:[^;]+;base64,/, ""), "base64").byteLength;

    // próxima ordem (maior + 1, prefixo 5000 pra novos uploads não conflitarem c/ migração)
    const [{ next_ordem }] = await sql<{ next_ordem: number }[]>`
      SELECT COALESCE(MAX(ordem), 4999) + 1 AS next_ordem
        FROM alissonerp.produto_imagens
       WHERE produto_id = ${produtoId}
    `;

    const inserted = await sql.begin(async (tx: any) => {
      if (definirComoCapa) {
        await tx`UPDATE alissonerp.produto_imagens SET eh_capa = false WHERE produto_id = ${produtoId} AND eh_capa = true`;
      }
      const [row] = await tx<ImagemRow[]>`
        INSERT INTO alissonerp.produto_imagens
          (produto_id, bucket, bucket_path, url_publica, ordem, eh_capa,
           origem, origem_tabela, filename, mime_type, filesize)
        VALUES
          (${produtoId}, ${BUCKET}, ${uploaded.path}, ${uploaded.url}, ${next_ordem},
           ${definirComoCapa}, 'upload', 'manual', ${filenameOriginal ?? null}, ${mimeType}, ${filesize})
        RETURNING id, produto_id::int, bucket, bucket_path, url_publica, ordem, eh_capa,
                  origem, origem_tabela, filename, mime_type, filesize::int,
                  false AS herdada
      `;
      return row;
    });

    return NextResponse.json({ imagem: inserted });
  } catch (err) {
    return internalError("[POST /api/produtos/[id]/imagens]", err);
  }
}
