import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import type { LLMProvider } from './types';
import type { LLMResult } from '../../shared/tipos';

export function createDeepSeekProvider(model = 'deepseek-chat'): LLMProvider {
  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY!,
  });

  return {
    async chat({ messages, tools, maxTokens = 2000 }): Promise<LLMResult> {
      const result = await generateText({
        model: deepseek(model),
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
