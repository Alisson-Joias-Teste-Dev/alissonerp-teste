/**
 * Foto de Ficha Técnica do produto.
 *
 *   GET    /api/produtos/[id]/ficha-tecnica — retorna { url, id } ou { null }
 *   PUT    /api/produtos/[id]/ficha-tecnica — body { foto_base64 } → substitui
 *   DELETE /api/produtos/[id]/ficha-tecnica — remove
 *
 * Armazena em alissonerp.produto_imagens com origem='ficha_tecnica' (1 por produto).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { isProdutosAccess, isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const FichaTecPutSchema = z.object({
  foto_base64: z.string().min(1, "obrigatório"),
}).passthrough();

const BUCKET = "imagens";
const ORIGEM_FICHA = "ficha_tecnica";

function parseProdutoId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const [row] = await sql`
      SELECT id, url_publica, bucket, bucket_path
      FROM alissonerp.produto_imagens
      WHERE produto_id = ${produtoId} AND origem = ${ORIGEM_FICHA}
      ORDER BY id DESC LIMIT 1
    `;
    if (!row) return NextResponse.json({ ficha: null });
    return NextResponse.json({
      ficha: {
        id: Number(row.id),
        url: String(row.url_publica),
      },
    });
  } catch (err) {
    console.error("[GET ficha-tecnica]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── PUT (substitui) ─────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !isProdutosAccess(role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = FichaTecPutSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const fotoBase64 = body.foto_base64;
  if (!fotoBase64 || !fotoBase64.startsWith("data:")) {
    return NextResponse.json({ error: "foto_base64 inválido (data URL esperado)" }, { status: 400 });
  }
  const matches = fotoBase64.match(/^data:([^;]+);base64,/);
  const mimeType = matches?.[1] ?? "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Apenas imagens são aceitas" }, { status: 400 });
  }
  const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";

  try {
    const uuid = randomUUID();
    const path = `produtos/${produtoId}/ficha-tecnica/${uuid}.${ext}`;
    const uploaded = await uploadFile(BUCKET, path, fotoBase64, mimeType);
    if ("error" in uploaded) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }

    const filesize = Buffer.from(fotoBase64.replace(/^data:[^;]+;base64,/, ""), "base64").byteLength;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserted = await (sql as any).begin(async (tx: typeof sql) => {
      // Remove ficha técnica anterior (se houver) — só registro da DB. O arquivo
      // antigo permanece no bucket (sem GC automático nesta versão).
      await tx`
        DELETE FROM alissonerp.produto_imagens
        WHERE produto_id = ${produtoId} AND origem = ${ORIGEM_FICHA}
      `;
      const [row] = await tx`
        INSERT INTO alissonerp.produto_imagens
          (produto_id, bucket, bucket_path, url_publica, ordem, eh_capa,
           origem, origem_tabela, mime_type, filesize)
        VALUES
          (${produtoId}, ${BUCKET}, ${uploaded.path}, ${uploaded.url}, 9000, false,
           ${ORIGEM_FICHA}, 'manual', ${mimeType}, ${filesize})
        RETURNING id, url_publica
      `;
      return row;
    });

    return NextResponse.json({
      ficha: { id: Number(inserted.id), url: String(inserted.url_publica) },
    });
  } catch (err) {
    console.error("[PUT ficha-tecnica]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const role = u?.role ?? null;
  if (!role || (!isFullAccess(role) && !isProdutosAccess(role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const produtoId = parseProdutoId(id);
  if (!produtoId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    await sql`
      DELETE FROM alissonerp.produto_imagens
      WHERE produto_id = ${produtoId} AND origem = ${ORIGEM_FICHA}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE ficha-tecnica]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
