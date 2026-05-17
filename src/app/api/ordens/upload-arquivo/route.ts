import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { uploadFile, deleteFile } from "@/lib/storage";
import { internalError } from "@/lib/api-error";

const BUCKETS_PERMITIDOS = ["ordem-fotos", "ordem-videos"];

// POST /api/ordens/upload-arquivo
// Aceita dois formatos:
//   1. FormData: { file: File, bucket: string, path: string }  — arquivos grandes (vídeos)
//   2. JSON:     { bucket, path, base64, contentType }          — arquivos pequenos (imagens)
// Retorna: { url, path }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const ct = req.headers.get("content-type") ?? "";
  const isFormData = ct.includes("multipart/form-data");

  let bucket: string | null = null;
  let filePath: string | null = null;

  if (isFormData) {
    // ── FormData (binário direto) ──────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    bucket   = formData.get("bucket") as string | null;
    filePath = formData.get("path")   as string | null;

    if (!file || !bucket || !filePath) {
      return NextResponse.json({ error: "file, bucket e path são obrigatórios" }, { status: 400 });
    }
    if (!BUCKETS_PERMITIDOS.includes(bucket)) {
      return NextResponse.json({ error: "Bucket inválido" }, { status: 400 });
    }

    const buffer      = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";

    const storageKey    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, storageKey);

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType, upsert: true });

    if (error) {
      return internalError("[POST /api/ordens/upload-arquivo] storage", error, "Falha ao salvar arquivo");
    }

    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${data.path}`;
    return NextResponse.json({ path: data.path, url });

  } else {
    // ── JSON (base64) — para imagens e arquivos ≤10MB ──────────────────
    const body = await req.json() as {
      bucket?: string; path?: string; base64?: string; contentType?: string;
    };
    bucket   = body.bucket ?? null;
    filePath = body.path   ?? null;
    const base64      = body.base64 ?? null;
    const contentType = body.contentType ?? "application/octet-stream";

    if (!bucket || !filePath || !base64) {
      return NextResponse.json({ error: "bucket, path e base64 são obrigatórios" }, { status: 400 });
    }
    if (!BUCKETS_PERMITIDOS.includes(bucket)) {
      return NextResponse.json({ error: "Bucket inválido" }, { status: 400 });
    }

    const result = await uploadFile(bucket, filePath, base64, contentType);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ path: result.path, url: result.url });
  }
}

// DELETE /api/ordens/upload-arquivo
// Body JSON: { bucket, path }
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as { bucket?: string; path?: string };
  const { bucket, path } = body;
  if (!bucket || !path) {
    return NextResponse.json({ error: "bucket e path são obrigatórios" }, { status: 400 });
  }

  await deleteFile(bucket, path).catch(() => {});
  return NextResponse.json({ success: true });
}
