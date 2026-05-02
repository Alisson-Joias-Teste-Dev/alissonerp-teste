import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LLMProvider } from './types';
import type { LLMResult } from '../../shared/tipos';
import { getAllTools, logToolCall } from '../tools/registry';
import { executeTool } from '../tools/executor';

export function createDeepSeekProvider(model = 'deepseek-chat'): LLMProvider {
  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY!,
  });

  return {
    async chat({ messages, maxTokens = 2000, usuarioSkillId }): Promise<LLMResult> {
      const registeredTools = getAllTools();
      let totalTokensIn = 0;
      let totalTokensOut = 0;

      const toolDescriptions = registeredTools.length > 0
        ? '\n\n---\nVOCÊ TEM ACESSO A FERRAMENTAS DO ERP.\n' +
          'Para usar uma, responda EXATAMENTE neste formato JSON (sem texto extra, sem comentários):\n' +
          '{"tool":"nome_da_ferramenta","args":{"param1":"valor1"}}\n\n' +
          'Ferramentas disponíveis:\n' +
          registeredTools.map((t) => {
            const params = (t.parameters as any)?.properties
              ? Object.entries((t.parameters as any).properties)
                  .map(([k, v]: [string, any]) => `  - ${k}: ${v.description ?? ''}`)
                  .join('\n')
              : '  Sem parâmetros';
            return `\n### ${t.name}\n${t.description}\nParâmetros:\n${params}`;
          }).join('\n') +
          '\n\n---\nApós receber o resultado, responda ao usuário em português.'
        : '';

      const systemMsg = messages.find((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
      const systemContent = {
        role: 'system',
        content: (systemMsg?.content ?? '') + toolDescriptions,
      };

      let currentMessages: Array<{ role: string; content: string }> = [systemContent, ...nonSystemMsgs];
      let finalText = '';

      for (let round = 0; round < 3; round++) {
        const result = await generateText({
          model: deepseek(model),
          messages: currentMessages,
          maxOutputTokens: maxTokens,
          allowSystemInMessages: true,
        } as Parameters<typeof generateText>[0]);

        totalTokensIn += result.usage?.inputTokens ?? 0;
        totalTokensOut += result.usage?.outputTokens ?? 0;

        const text = result.text.trim();

        if (text.startsWith('{') && text.endsWith('}')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.tool) {
              const toolResult = await executeTool(parsed.tool, parsed.args ?? {}, usuarioSkillId ?? 0);

              if (usuarioSkillId) {
                await logToolCall({
                  usuarioSkillId,
                  toolName: parsed.tool,
                  args: parsed.args ?? {},
                  isEscrita: false,
                  duracaoMs: 0,
                  resultado: toolResult,
                });
              }

              currentMessages.push(
                { role: 'assistant', content: text },
                { role: 'user', content: `Resultado: ${JSON.stringify(toolResult)}` },
              );

              if (!toolResult.success) {
                currentMessages.push({
                  role: 'user',
                  content: 'A ferramenta retornou erro. Informe o usuário educadamente em português.',
                });
              }

              continue;
            }
          } catch {
            // JSON inválido ou não é tool call
          }
        }

        finalText = text;
        break;
      }

      return {
        content: finalText || 'Não foi possível processar sua solicitação.',
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        model,
      };
    },
  };
}
