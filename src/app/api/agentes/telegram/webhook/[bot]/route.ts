import { NextRequest, NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/agentes/core/telegram/webhook-secret';
import { processUpdate } from '@/agentes/core/orchestrator';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bot: string }> },
): Promise<NextResponse> {
  const { bot } = await params;

  if (!validateWebhookSecret(req, bot)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  console.log(`[telegram/${bot}]`, JSON.stringify(body).substring(0, 200));

  try {
    await processUpdate(body as Parameters<typeof processUpdate>[0], bot);
  } catch (error) {
    return internalError(`[telegram/${bot}]`, error, "Erro interno no processamento");
  }

  return NextResponse.json({ ok: true });
}
