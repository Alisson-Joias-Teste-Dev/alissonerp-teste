import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { LLMProvider } from './types';
import type { LLMResult } from '../../shared/tipos';

export function createAnthropicProvider(
  model: 'claude-3-5-haiku-latest' | 'claude-3-5-sonnet-latest' = 'claude-3-5-haiku-latest'
): LLMProvider {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  return {
    async chat({ messages, tools, maxTokens = 2000 }): Promise<LLMResult> {
      const result = await generateText({
        model: anthropic(model),
        messages,
        tools,
        maxOutputTokens: maxTokens,
        allowSystemInMessages: true,
      } as Parameters<typeof generateText>[0]);

      return {
        content: result.text,
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
        model,
      };
    },
  };
}
