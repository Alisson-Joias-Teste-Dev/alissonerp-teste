/**
 * Editor IA — dispatcher multi-modelo (SERVER-SIDE).
 * Usa fetch direto para Gemini REST e OpenAI (sem SDK) para nao puxar deps novas.
 */

export type ModelId =
  | "gemini-3.1-flash-image-preview"
  | "gemini-2.5-flash-image"
  | "gpt-image-2"
  | "imagen-4.0-generate-001";

export interface ModelInfo {
  id: ModelId;
  name: string;
  provider: "google" | "openai";
  supportsEdit: boolean;
  costLevel: "free" | "low" | "medium" | "high";
  description: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    provider: "google",
    supportsEdit: true,
    costLevel: "free",
    description: "Gratuito no AI Studio. Bom custo-benefício.",
  },
  {
    id: "gemini-3.1-flash-image-preview",
    name: "Gemini 3.1 Flash Image",
    provider: "google",
    supportsEdit: true,
    costLevel: "medium",
    description: "Nova geração Google. Mais preservação e qualidade.",
  },
  {
    id: "gpt-image-2",
    name: "GPT-Image-2 (OpenAI) · Novo",
    provider: "openai",
    supportsEdit: true,
    costLevel: "high",
    description: "Nova geração OpenAI (agentic, 2K, melhor texto). Exige org verificada — sem verificação, usa gpt-image-1 automaticamente.",
  },
  {
    id: "imagen-4.0-generate-001",
    name: "Imagen 4 (Google)",
    provider: "google",
    supportsEdit: false,
    costLevel: "high",
    description: "Só geração do zero — não edita, regenera.",
  },
];

export type AspectRatio = "1:1" | "9:16" | "16:9" | "4:3" | "3:4";

export interface GenerateOptions {
  model: ModelId;
  images: string[]; // data URLs (base64) da(s) imagem(ns) de entrada
  prompt: string;
  aspectRatio?: AspectRatio;
  apiKeys?: { gemini?: string; openai?: string };
}

export interface GenerateResult {
  imageUrl: string; // data URL
  mimeType: string;
  base64: string;   // sem prefixo
  model: ModelId;
  elapsedMs: number;
}

function geminiKey(opts: GenerateOptions): string {
  return (opts.apiKeys?.gemini || process.env.GEMINI_API_KEY || "").trim();
}
function openaiKey(opts: GenerateOptions): string {
  return (opts.apiKeys?.openai || process.env.OPENAI_API_KEY || "").trim();
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Imagem de entrada inválida (esperado data:URL base64).");
  return { mime: m[1], base64: m[2] };
}

async function generateWithGemini(opts: GenerateOptions): Promise<GenerateResult> {
  const key = geminiKey(opts);
  if (!key) throw new Error("Chave Gemini não configurada (defina em /editor-ia > Config API ou .env.local).");
  const start = Date.now();

  const parts: Array<Record<string, unknown>> = [{ text: opts.prompt }];
  for (const img of opts.images) {
    const { mime, base64 } = parseDataUrl(img);
    parts.push({ inlineData: { data: base64, mimeType: mime } });
  }

  const imageConfig: Record<string, unknown> = { aspectRatio: opts.aspectRatio || "1:1" };
  if (opts.model === "gemini-3.1-flash-image-preview") imageConfig.imageSize = "1K";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { imageConfig },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || r.statusText}`);

  const returned = j?.candidates?.[0]?.content?.parts || [];
  for (const p of returned) {
    if (p?.inlineData?.data) {
      const mime = p.inlineData.mimeType || "image/png";
      const base64 = p.inlineData.data as string;
      return {
        imageUrl: `data:${mime};base64,${base64}`,
        mimeType: mime,
        base64,
        model: opts.model,
        elapsedMs: Date.now() - start,
      };
    }
  }
  throw new Error("Gemini não retornou imagem.");
}

async function generateWithImagen(opts: GenerateOptions): Promise<GenerateResult> {
  const key = geminiKey(opts);
  if (!key) throw new Error("Chave Gemini não configurada (defina em /editor-ia > Config API ou .env.local).");
  const start = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:predict`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: { sampleCount: 1, aspectRatio: opts.aspectRatio || "1:1" },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Imagen ${r.status}: ${j?.error?.message || r.statusText}`);

  const pred = j?.predictions?.[0];
  const base64 = pred?.bytesBase64Encoded || pred?.image?.imageBytes;
  const mime = pred?.mimeType || pred?.image?.mimeType || "image/png";
  if (!base64) throw new Error("Imagen não retornou imagem.");

  return {
    imageUrl: `data:${mime};base64,${base64}`,
    mimeType: mime,
    base64,
    model: opts.model,
    elapsedMs: Date.now() - start,
  };
}

function mapGptImageSize(ratio?: AspectRatio): string {
  switch (ratio) {
    case "9:16":
    case "3:4":
      return "1024x1536";
    case "16:9":
    case "4:3":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

async function generateWithGptImage(opts: GenerateOptions): Promise<GenerateResult> {
  const key = openaiKey(opts);
  if (!key) throw new Error("Chave OpenAI não configurada (defina em /editor-ia > Config API ou .env.local).");
  if (opts.images.length === 0) throw new Error("GPT-Image requer imagem de entrada.");
  const start = Date.now();

  const { mime, base64 } = parseDataUrl(opts.images[0]);
  const buffer = Buffer.from(base64, "base64");
  const ext = mime === "image/jpeg" ? "jpg" : "png";

  // Tenta primeiro gpt-image-2 (novo, 2K, agentic). Se a org não estiver
  // verificada, OpenAI retorna 403; cai pro gpt-image-1 (GA) automaticamente.
  async function callModel(model: "gpt-image-2" | "gpt-image-1") {
    const fd = new FormData();
    fd.append("model", model);
    fd.append("image", new Blob([new Uint8Array(buffer)], { type: mime }), `input.${ext}`);
    fd.append("prompt", opts.prompt);
    fd.append("size", mapGptImageSize(opts.aspectRatio));
    fd.append("n", "1");
    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const j = await r.json();
    return { ok: r.ok, status: r.status, body: j };
  }

  let resp = await callModel("gpt-image-2");
  let modelUsed: "gpt-image-2" | "gpt-image-1" = "gpt-image-2";
  if (!resp.ok && resp.status === 403 && /verified|verify/i.test(resp.body?.error?.message || "")) {
    // Fallback silencioso — log no servidor pra visibilidade.
    console.warn("[editor-ia] gpt-image-2 exige org verificada; usando gpt-image-1.");
    resp = await callModel("gpt-image-1");
    modelUsed = "gpt-image-1";
  }
  if (!resp.ok) {
    throw new Error(`OpenAI ${resp.status}: ${resp.body?.error?.message || "erro"}`);
  }

  const b64 = resp.body?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${modelUsed} não retornou imagem.`);

  return {
    imageUrl: `data:image/png;base64,${b64}`,
    mimeType: "image/png",
    base64: b64,
    model: "gpt-image-2", // mantemos o ID lógico do model selecionado na UI
    elapsedMs: Date.now() - start,
  };
}

export async function generateImage(opts: GenerateOptions): Promise<GenerateResult> {
  switch (opts.model) {
    case "gemini-3.1-flash-image-preview":
    case "gemini-2.5-flash-image":
      return generateWithGemini(opts);
    case "gpt-image-2":
      return generateWithGptImage(opts);
    case "imagen-4.0-generate-001":
      return generateWithImagen(opts);
    default:
      throw new Error(`Modelo não suportado: ${opts.model}`);
  }
}
