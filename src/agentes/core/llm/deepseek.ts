import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LLMProvider } from './types';
import type { LLMResult } from '../../shared/tipos';
import { getAllTools } from '../tools/registry';
import { logToolCall } from '../tools/registry';

export function createDeepSeekProvider(model = 'deepseek-chat'): LLMProvider {
  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY!,
  });

  return {
    async chat({ messages, tools: _, maxTokens = 2000, usuarioSkillId }): Promise<LLMResult> {
      const registeredTools = getAllTools();

      const aiTools: Record<string, {
        description: string;
        parameters: Record<string, unknown>;
        execute?: (args: Record<string, unknown>) => Promise<unknown>;
      }> = {};

      for (const t of registeredTools) {
        aiTools[t.name] = {
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
          execute: t.execute,
        };
      }

      let totalTokensIn = 0;
      let totalTokensOut = 0;

      const result = await generateText({
        model: deepseek(model),
        messages,
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: 5,
        maxOutputTokens: maxTokens,
        allowSystemInMessages: true,
        onStepFinish: async (stepResult) => {
          totalTokensIn += (stepResult as any)?.usage?.inputTokens ?? 0;
          totalTokensOut += (stepResult as any)?.usage?.outputTokens ?? 0;

          if (stepResult.toolCalls && usuarioSkillId) {
            for (const tc of stepResult.toolCalls) {
            const tcArgs = (tc as any).args ?? (tc as any).parameters ?? {};
              await logToolCall({
                usuarioSkillId,
                toolName: tc.toolName,
                args: tcArgs,
                isEscrita: false,
                duracaoMs: 0,
              });
            }
          }
        },
      } as Parameters<typeof generateText>[0]);

      return {
        content: result.text,
        tokensIn: totalTokensIn || (result.usage?.inputTokens ?? 0),
        tokensOut: totalTokensOut || (result.usage?.outputTokens ?? 0),
        model,
      };
    },
  };
}
