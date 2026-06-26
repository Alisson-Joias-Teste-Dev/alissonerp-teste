import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile } from "@/lib/storage";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  LIMITS,
  checkBase64Length,
  checkStringLength,
  payloadTooLargeResponse,
} from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

const UploadVideoSchema = z.object({
  base64: z.string().min(1, "obrigatório"),
  mime: z.string().min(1, "obrigatório"),
  filename: z.string().optional(),
}).passthrough();

// POST /api/vendas/upload-video
// Body: { base64: string, mime: string, filename?: string }
// Faz upload no bucket vendas-videos e retorna a URL pública
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Video base64 = upload pesado. 10/min por user evita abuso/upload em loop.
  try {
    rateLimit(`vendas-upload-video:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = UploadVideoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  try {
    checkBase64Length("base64", body.base64, LIMITS.VIDEO_BASE64_MAX);
    checkStringLength("filename", body.filename, LIMITS.NOME_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  const ext  = body.mime?.includes("mp4") ? "mp4" : body.mime?.includes("webm") ? "webm" : "mov";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const result = await uploadFile("vendas-videos", path, body.base64, body.mime ?? "video/mp4");

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url, path: result.path });
}
