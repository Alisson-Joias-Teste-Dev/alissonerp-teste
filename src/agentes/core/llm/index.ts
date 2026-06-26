import type { LLMProvider } from './types';
import { createDeepSeekProvider } from './deepseek';
import { createAnthropicProvider } from './anthropic';

export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? 'deepseek';

  if (provider === 'anthropic') {
    return createAnthropicProvider();
  }

  return createDeepSeekProvider();
}

export { createDeepSeekProvider, createAnthropicProvider };
