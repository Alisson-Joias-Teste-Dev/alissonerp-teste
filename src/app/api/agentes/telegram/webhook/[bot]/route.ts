import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateWebhookSecret } from '@/agentes/core/telegram/webhook-secret';
import { processUpdate } from '@/agentes/core/orchestrator';
import { internalError } from '@/lib/api-error';
import { zodError } from '@/lib/schemas/common';

// Telegram webhook envia payloads variados — usa passthrough() para aceitar tudo.
const TelegramWebhookSchema = z.object({}).passthrough();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bot: string }> },
): Promise<NextResponse> {
  const { bot } = await params;

  if (!validateWebhookSecret(req, bot)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ ok: false }, { status: 400 });
  const parsed = TelegramWebhookSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  console.log(`[telegram/${bot}]`, JSON.stringify(body).substring(0, 200));

  try {
    await processUpdate(body as unknown as Parameters<typeof processUpdate>[0], bot);
  } catch (error) {
    return internalError(`[telegram/${bot}]`, error, "Erro interno no processamento");
  }

  return NextResponse.json({ ok: true });
}
