/**
 * POST /api/editor-ia/generate
 * Gera imagem via Editor IA com dedup global por hash (input + params).
 *
 * Body:
 *   {
 *     images:        string[] (data URLs base64),
 *     category?:     string,
 *     sceneId:       string,
 *     sceneName?:    string,
 *     model:         ModelId,
 *     aspectRatio?:  "1:1" | "9:16" | "16:9" | "4:3" | "3:4",
 *     details?:      string,
 *   }
 *
 * Response:
 *   { cached: boolean, item: HistoricoItem }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { ensureBucket, uploadFile } from "@/lib/storage";
import { buildFinalPrompt } from "@/lib/editor-ia/prompts";
import { generateImage, AVAILABLE_MODELS, type ModelId, type AspectRatio } from "@/lib/editor-ia/engine";
import { internalError } from "@/lib/api-error";
import { getApiKeys } from "@/lib/editor-ia/api-keys";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const BUCKET = "editor-ia-geradas";

export const runtime = "nodejs";
export const maxDuration = 120;

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function hashImages(images: string[]): string {
  const h = crypto.createHash("sha256");
  for (const img of images) h.update(img);
  return h.digest("hex");
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // IA paga (Gemini/OpenAI): limita 3/min e 30/hora por user. Dedup global por
  // hash entra antes da chamada, mas o rate limit protege mesmo input variado.
  try {
    rateLimit(`editor-ia-generate:min:${user.id}`, 3, 60_000);
    rateLimit(`editor-ia-generate:hour:${user.id}`, 30, 60 * 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const images: string[] = Array.isArray(body?.images) ? body.images : [];
  const category: string | undefined = body?.category ? String(body.category) : undefined;
  const sceneId: string = String(body?.sceneId || "");
  const sceneName: string | undefined = body?.sceneName ? String(body.sceneName) : undefined;
  const modelId: string = String(body?.model || "");
  const aspectRatio: AspectRatio = (body?.aspectRatio as AspectRatio) || "1:1";
  const details: string | undefined = body?.details ? String(body.details).trim() : undefined;

  if (!images.length) return NextResponse.json({ error: "Nenhuma imagem enviada." }, { status: 400 });
  if (!sceneId)       return NextResponse.json({ error: "Cenário obrigatório." }, { status: 400 });
  if (!modelId)       return NextResponse.json({ error: "Modelo obrigatório." }, { status: 400 });

  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return NextResponse.json({ error: `Modelo desconhecido: ${modelId}` }, { status: 400 });

  // ----- Dedup hash -----
  const inputHash = hashImages(images);
  const paramsKey = [category ?? "", sceneId, modelId, aspectRatio, details ?? ""].join("|");
  const paramsHash = sha256(paramsKey);

  const existing = await sql<
    Array<{
      id: string;
      imagem_url: string;
      storage_path: string;
      modelo: string;
      categoria: string | null;
      cenario_id: string | null;
      cenario_nome: string | null;
      aspect_ratio: string | null;
      detalhes: string | null;
      prompt_final: string | null;
      elapsed_ms: number | null;
      created_at: string;
      cache_hits: number;
    }>
  >`
    SELECT id, imagem_url, storage_path, modelo, categoria,
           cenario_id, cenario_nome, aspect_ratio, detalhes,
           prompt_final, elapsed_ms, created_at, cache_hits
      FROM alissonerp.editor_ia_historico
     WHERE input_hash = ${inputHash}
       AND params_hash = ${paramsHash}
     LIMIT 1
  `;

  if (existing.length > 0) {
    const row = existing[0];
    await sql`
      UPDATE alissonerp.editor_ia_historico
         SET cache_hits = cache_hits + 1
       WHERE id = ${row.id}
    `;
    return NextResponse.json({ cached: true, item: { ...row, cache_hits: row.cache_hits + 1 } });
  }

  // ----- Monta prompt final -----
  const promptFinal = buildFinalPrompt({ category, sceneId, additionalDetails: details });

  // ----- Gera imagem -----
  const apiKeys = await getApiKeys();
  let result;
  try {
    result = await generateImage({
      model: modelId as ModelId,
      images,
      prompt: promptFinal,
      aspectRatio,
      apiKeys,
    });
  } catch (err) {
    return internalError("[POST /api/editor-ia/generate] generateImage", err, "Falha na geração de imagem", 502);
  }

  // ----- Upload para bucket -----
  await ensureBucket(BUCKET);
  const ext = result.mimeType === "image/jpeg" ? "jpg" : "png";
  const path = `${user.id}/${Date.now()}_${inputHash.slice(0, 8)}_${paramsHash.slice(0, 8)}.${ext}`;
  const up = await uploadFile(BUCKET, path, result.base64, result.mimeType);
  if ("error" in up) {
    return internalError("[POST /api/editor-ia/generate] upload", new Error(up.error), "Falha no upload");
  }

  // Nome do usuário (best effort)
  const nomeRow = await sql<Array<{ nome: string | null }>>`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `.catch(() => [] as Array<{ nome: string | null }>);
  const userNome = nomeRow[0]?.nome ?? user.email ?? null;

  // ----- Registra no histórico -----
  const [row] = await sql<
    Array<{
      id: string;
      imagem_url: string;
      storage_path: string;
      modelo: string;
      categoria: string | null;
      cenario_id: string | null;
      cenario_nome: string | null;
      aspect_ratio: string | null;
      detalhes: string | null;
      prompt_final: string | null;
      elapsed_ms: number | null;
      created_at: string;
      cache_hits: number;
    }>
  >`
    INSERT INTO alissonerp.editor_ia_historico (
      user_id, user_nome, input_hash, params_hash,
      categoria, cenario_id, cenario_nome, modelo,
      aspect_ratio, detalhes, prompt_final,
      imagem_url, storage_path, elapsed_ms
    ) VALUES (
      ${user.id}, ${userNome}, ${inputHash}, ${paramsHash},
      ${category ?? null}, ${sceneId}, ${sceneName ?? null}, ${modelId},
      ${aspectRatio}, ${details ?? null}, ${promptFinal},
      ${up.url}, ${up.path}, ${result.elapsedMs}
    )
    RETURNING id, imagem_url, storage_path, modelo, categoria,
              cenario_id, cenario_nome, aspect_ratio, detalhes,
              prompt_final, elapsed_ms, created_at, cache_hits
  `;

  return NextResponse.json({ cached: false, item: row });
}
