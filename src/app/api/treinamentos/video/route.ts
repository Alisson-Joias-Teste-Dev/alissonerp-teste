import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { uploadFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIMITS, checkBase64Length, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/treinamentos/video — anexa/troca o vídeo de um treinamento.
 *
 * REGRA DE NEGÓCIO: só o DESENVOLVEDOR anexa vídeo (decisão do Jonathan). Guarda
 * 1 vídeo por treinamento (upsert por treinamento_key), no bucket público
 * treinamento-videos. Qualquer usuário logado VÊ o vídeo; só dev troca.
 */
const VideoSchema = z.object({
  treinamento_key: z.string().min(1).max(80),
  base64: z.string().min(1, "obrigatório"),
  mime: z.string().min(1, "obrigatório"),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (user.role !== "desenvolvedor") {
    return NextResponse.json({ error: "Apenas o desenvolvedor pode anexar vídeo." }, { status: 403 });
  }

  try {
    rateLimit(`treino-upload-video:${user.id}`, 10, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = VideoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { treinamento_key, base64, mime } = parsed.data;

  try {
    checkBase64Length("base64", base64, LIMITS.VIDEO_BASE64_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  const ext = mime.includes("webm") ? "webm" : mime.includes("mov") || mime.includes("quicktime") ? "mov" : "mp4";
  const path = `${treinamento_key}/${Date.now()}.${ext}`;
  const result = await uploadFile("treinamento-videos", path, base64, mime || "video/mp4");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await sql`
    INSERT INTO alissonerp.treinamento_videos (treinamento_key, video_path, updated_by, updated_at)
    VALUES (${treinamento_key}, ${result.path}, ${user.id}::uuid, now())
    ON CONFLICT (treinamento_key)
    DO UPDATE SET video_path = EXCLUDED.video_path, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;

  await logAudit(sql, {
    tabela: "treinamento_videos",
    operacao: "UPDATE",
    registro_id: 0,
    usuario_id: user.id,
    dados_depois: { treinamento_key, video_path: result.path },
  });

  return NextResponse.json({ path: result.path });
}
