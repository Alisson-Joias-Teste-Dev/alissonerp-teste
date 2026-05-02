import { describe, it, expect } from 'vitest';
import { buildPrompt, computePromptHash, buildMessages } from '../../src/agentes/core/prompt/builder';

describe('prompt builder', () => {
  it('deve computar hash consistente', () => {
    const hash1 = computePromptHash('hello');
    const hash2 = computePromptHash('hello');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('deve montar mensagens com system, janela e msg atual', () => {
    const result = buildMessages({
      systemPrompt: 'You are a helpful assistant.',
      janela: [
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'olá' },
      ],
      mensagemAtual: 'qual o status da OP 123?',
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(result[1]).toEqual({ role: 'user', content: 'oi' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'olá' });
    expect(result[3]).toEqual({ role: 'user', content: 'qual o status da OP 123?' });
  });
});
