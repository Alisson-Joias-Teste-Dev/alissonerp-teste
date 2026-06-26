const CACHE = new Map<string, { baseUrl: string; token: string }>();

function getBotConfig(skillSlug: string): { baseUrl: string; token: string } {
  const cached = CACHE.get(skillSlug);
  if (cached) return cached;

  const envKey = skillSlug === 'gerente-producao'
    ? 'TELEGRAM_BOT_TOKEN_GERENTE'
    : `TELEGRAM_BOT_TOKEN_${skillSlug.toUpperCase().replace(/-/g, '_')}`;

  const token = process.env[envKey];
  if (!token) {
    throw new Error(`Token do bot "${skillSlug}" não configurado (env: ${envKey})`);
  }

  const config = { baseUrl: `https://api.telegram.org/bot${token}`, token };
  CACHE.set(skillSlug, config);
  return config;
}

export async function sendMessage(
  skillSlug: string,
  chatId: number,
  text: string,
  opts?: { replyToMessageId?: number; parseMode?: 'Markdown' | 'MarkdownV2' },
): Promise<{ messageId: number }> {
  const { baseUrl } = getBotConfig(skillSlug);

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  if (opts?.replyToMessageId) body.reply_to_message_id = opts.replyToMessageId;
  if (opts?.parseMode) body.parse_mode = opts.parseMode;

  const res = await fetch(`${baseUrl}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendMessage falhou (${res.status}): ${err}`);
  }

  const json = await res.json() as { result: { message_id: number } };
  return { messageId: json.result.message_id };
}

export async function deleteMessage(
  skillSlug: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  const { baseUrl } = getBotConfig(skillSlug);

  await fetch(`${baseUrl}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
