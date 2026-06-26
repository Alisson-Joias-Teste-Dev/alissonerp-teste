import { describe, it, expect } from 'vitest';
import { validateWebhookSecret } from '../../src/agentes/core/telegram/webhook-secret';

describe('validateWebhookSecret', () => {
  it('deve rejeitar sem header', () => {
    const req = new Request('http://localhost', {
      headers: {},
    });
    expect(validateWebhookSecret(req, 'gerente-producao')).toBe(false);
  });

  it('deve rejeitar header incorreto', () => {
    const req = new Request('http://localhost', {
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': 'wrong',
      },
    });

    const original = process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE;
    process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE = 'secret123';
    const result = validateWebhookSecret(req, 'gerente-producao');
    process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE = original;

    expect(result).toBe(false);
  });

  it('deve aceitar header correto', () => {
    const req = new Request('http://localhost', {
      headers: {
        'X-Telegram-Bot-Api-Secret-Token': 'secret123',
      },
    });

    const original = process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE;
    process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE = 'secret123';
    const result = validateWebhookSecret(req, 'gerente-producao');
    process.env.TELEGRAM_WEBHOOK_SECRET_GERENTE = original;

    expect(result).toBe(true);
  });
});
