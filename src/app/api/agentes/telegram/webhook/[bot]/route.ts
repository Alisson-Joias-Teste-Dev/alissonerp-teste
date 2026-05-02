import { NextRequest, NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/agentes/core/telegram/webhook-secret';
import { processUpdate } from '@/agentes/core/orchestrator';

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
    console.error(`[telegram/${bot}] erro:`, error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
