export function validateWebhookSecret(req: Request, botSlug: string): boolean {
  const envKey = botSlug === 'gerente-producao'
    ? 'TELEGRAM_WEBHOOK_SECRET_GERENTE'
    : `TELEGRAM_WEBHOOK_SECRET_${botSlug.toUpperCase().replace(/-/g, '_')}`;

  const expected = process.env[envKey];
  if (!expected) return false;

  const received = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return received === expected;
}
