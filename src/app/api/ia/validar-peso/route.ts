import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validarPesoBalanca } from "@/lib/ia-validar-peso";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { zodError } from "@/lib/schemas/common";

const ValidarPesoPostSchema = z.object({
  imagem_base64: z.string().min(1, "obrigatório"),
  peso_referencia: z.coerce.number().positive(),
  tolerancia: z.coerce.number().optional(),
  media_type: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  // IA visao (Gemini/Claude) custa por imagem + tokens. 10/min e 100/hora.
  // Janela mais permissiva que chat porque PCP/ourives validam pesos em sequencia.
  try {
    rateLimit(`ia-validar-peso:min:${user.id}`, 10, 60_000);
    rateLimit(`ia-validar-peso:hour:${user.id}`, 100, 60 * 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ValidarPesoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  const { imagem_base64, peso_referencia, media_type } = body;
  const tolerancia = body.tolerancia ?? 0.1;

  const resultado = await validarPesoBalanca(
    imagem_base64,
    media_type ?? "image/jpeg",
    peso_referencia,
    "metal",
  );

  // Aplicar tolerância customizada (SKU usa ±0.1g, metal usa ±0.005g)
  if (resultado.peso_balanca !== null) {
    const diff = Math.abs(resultado.peso_balanca - peso_referencia);
    const match = diff <= tolerancia;
    return NextResponse.json({
      match,
      tolerancia_usada: tolerancia,
      peso_digitado: peso_referencia,
      peso_balanca: resultado.peso_balanca,
      diferenca: parseFloat(diff.toFixed(3)),
      confianca: resultado.confianca,
      mensagem: match
        ? `Peso confirmado: ${resultado.peso_balanca}g`
        : `Peso não confere. Digitado: ${peso_referencia}g | Balança: ${resultado.peso_balanca}g | Diferença: ${diff.toFixed(3)}g > ${tolerancia}g`,
      provedor: resultado.provedor,
    });
  }

  return NextResponse.json({
    match: false,
    tolerancia_usada: tolerancia,
    peso_digitado: peso_referencia,
    peso_balanca: null,
    confianca: resultado.confianca,
    mensagem: resultado.mensagem,
    provedor: resultado.provedor,
  });
}
