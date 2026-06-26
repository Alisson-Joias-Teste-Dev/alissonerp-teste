import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { uploadFile, deleteFile } from "@/lib/storage";
import { internalError } from "@/lib/api-error";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIMITS, checkBase64Length, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

const UploadJsonSchema = z.object({
  bucket: z.string().min(1, "obrigatório"),
  path: z.string().min(1, "obrigatório"),
  base64: z.string().min(1, "obrigatório"),
  contentType: z.string().optional(),
}).passthrough();

const UploadDeleteSchema = z.object({
  bucket: z.string().min(1, "obrigatório"),
  path: z.string().min(1, "obrigatório"),
}).passthrough();

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

  // Aceita video — upload pesado. 10/min por user evita abuso.
  try {
    rateLimit(`ordens-upload:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

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

    // Limite de tamanho binario (video pode chegar a ~37.5MB; imagem normalmente < 4MB)
    if (file.size > LIMITS.VIDEO_BASE64_MAX) {
      return NextResponse.json(
        { error: `Arquivo excede limite (${file.size} > ${LIMITS.VIDEO_BASE64_MAX} bytes)` },
        { status: 413 },
      );
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
    const raw = await req.json().catch(() => ({}));
    const parsed = UploadJsonSchema.safeParse(raw);
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;
    bucket   = body.bucket;
    filePath = body.path;
    const base64      = body.base64;
    const contentType = body.contentType ?? "application/octet-stream";

    try {
      checkBase64Length("base64", base64, LIMITS.VIDEO_BASE64_MAX);
    } catch (e) {
      const r = payloadTooLargeResponse(e);
      if (r) return r;
      throw e;
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

  const raw = await req.json().catch(() => ({}));
  const parsed = UploadDeleteSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { bucket, path } = parsed.data;
  if (!bucket || !path) {
    return NextResponse.json({ error: "bucket e path são obrigatórios" }, { status: 400 });
  }

  await deleteFile(bucket, path).catch(() => {});
  return NextResponse.json({ success: true });
}
