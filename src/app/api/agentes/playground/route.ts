import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authOr401 } from '@/lib/auth-server';
import { isFullAccess } from '@/lib/roles';
import { createDeepSeekProvider } from '@/agentes/core/llm/deepseek';
import { internalError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  LIMITS,
  checkArrayLength,
  checkStringLength,
  payloadTooLargeResponse,
} from '@/lib/payload-limits';
import { zodError } from '@/lib/schemas/common';

const PlaygroundPostSchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
  message: z.string().optional(),
}).passthrough();

// ATENCAO: esta rota nao funciona em dev/prod hoje — depende de `ai` +
// `@ai-sdk/deepseek` que NAO estao instaladas no package.json. Qualquer
// request retorna 500 (erro de compilacao do modulo), independente de auth.
// Auth foi adicionada na onda 1A-4 como defesa em camadas para quando as
// deps forem instaladas. Enquanto isso, atacante tambem nao consegue invocar
// a LLM (mesmo efeito que 401), so nao recebe o codigo de status esperado.
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Defesa em camadas: token de env + sessao autenticada full-access
  const token = req.headers.get('X-Playground-Token');
  if (token !== process.env.DEV_PLAYGROUND_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  // LLM playground custa tokens DeepSeek. Limita 3/min e 30/hora por user.
  try {
    rateLimit(`agentes-playground:min:${user.id}`, 3, 60_000);
    rateLimit(`agentes-playground:hour:${user.id}`, 30, 60 * 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const parsed = PlaygroundPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  try {
    checkArrayLength('messages', body.messages, LIMITS.MENSAGENS_CHAT_MAX);
    checkStringLength('message', body.message, LIMITS.CHAT_MESSAGE_MAX);
    if (Array.isArray(body.messages)) {
      for (const m of body.messages) {
        checkStringLength('messages[].content', m?.content, LIMITS.CHAT_MESSAGE_MAX);
      }
    }
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

  const messages = body.messages ?? [
    { role: 'user', content: body.message ?? 'Olá' },
  ];

  const llm = createDeepSeekProvider();

  try {
    const result = await llm.chat({ messages, maxTokens: 500 });
    return NextResponse.json({
      response: result.content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.model,
    });
  } catch (error) {
    return internalError("[POST /api/agentes/playground]", error, "LLM request failed", 502);
  }
}
