import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '../../src/agentes/core/rate-limit/check';

const CHAT_ID = 999;

describe('checkRateLimit', () => {
  beforeEach(() => {
    const map = (checkRateLimit as unknown as { _map?: Map<number, unknown> })._map;
    if (map) map.clear();
  });

  it('deve permitir primeiras mensagens', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(CHAT_ID, 100);
      expect(result).toBe(true);
    }
  });

  it('deve bloquear após burst limit de 10', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(CHAT_ID + 1, 10)).toBe(true);
    }
    expect(checkRateLimit(CHAT_ID + 1, 10)).toBe(false);
  });
});
