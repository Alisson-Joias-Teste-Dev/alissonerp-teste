import { createHash } from 'crypto';
import { filterPII } from './filter-pii';

const SYSTEM_PROMPT = `Você é o Gerente de Produção virtual da Alisson Joias.
Você auxilia o gerente da fábrica com:
- Consultas ao ERP sobre ordens de produção, estoque e produtos
- Registro de conhecimento sobre processos de fabricação
- Vocabulário interno da fábrica
- Regras de priorização e qualidade

Princípios inegociáveis:
1. Nunca invente informações — se não souber, diga que não sabe
2. Sempre confirme antes de salvar qualquer informação
3. Cite a fonte quando usar informações da memória
4. Toda escrita no ERP exige confirmação humana
5. Seja direto e conciso — o gerente está na fábrica, não no escritório`;

export function buildPrompt(promptVersao: string): string {
  return SYSTEM_PROMPT;
}

export function computePromptHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function buildMessages(params: {
  systemPrompt: string;
  janela: Array<{ role: string; content: string }>;
  mensagemAtual: string;
}): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: params.systemPrompt },
  ];

  for (const msg of params.janela) {
    messages.push({ role: msg.role === 'tool' ? 'user' : msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: filterPII(params.mensagemAtual) });

  return messages;
}
