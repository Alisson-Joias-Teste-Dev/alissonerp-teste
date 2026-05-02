import { parseUpdate } from './telegram/parse';
import { validateWebhookSecret } from './telegram/webhook-secret';
import { handleMedia } from './telegram/ignore-media';
import { sendMessage } from './telegram/send';
import { handleAuthFlow } from './auth/login-telegram';
import { verifyAndRenewToken } from './auth/verify-token';
import { getJanela, insertConversa } from './memory/conversas';
import { buildMessages, computePromptHash } from './prompt/builder';
import { getLLMProvider } from './llm';
import { checkRateLimit } from './rate-limit/check';
import { filterPII } from './prompt/filter-pii';
import type { TelegramUpdate } from '../shared/tipos';

export async function processUpdate(rawBody: TelegramUpdate, botSlug: string): Promise<string> {
  const parsed = parseUpdate(rawBody);

  if (parsed.kind === 'unknown') {
    return 'unknown update type';
  }

  if (parsed.kind === 'media') {
    await handleMedia(botSlug, parsed.chatId, parsed.messageId, parsed.mediaType);
    return 'media handled';
  }

  if (parsed.kind === 'callback_query') {
    await sendMessage(botSlug, parsed.chatId, 'Botões em breve disponíveis.');
    return 'callback handled';
  }

  const chatId = parsed.chatId;
  const text = parsed.text.trim();

  const authResult = await handleAuthFlow(chatId, text, botSlug);

  if (!authResult.authenticated) {
    await sendMessage(botSlug, chatId, authResult.reply);
    return 'auth required';
  }

  const session = await verifyAndRenewToken(chatId);
  if (!session) {
    await sendMessage(botSlug, chatId, 'Sessão expirada. Vamos autenticar novamente.');
    return 'session expired';
  }

  const tokens30d = 0;
  if (!checkRateLimit(chatId, tokens30d)) {
    await sendMessage(botSlug, chatId, 'Muitas mensagens. Aguarde um pouco.');
    return 'rate limited';
  }

  await insertConversa({
    usuarioSkillId: session.usuarioSkillId,
    role: 'user',
    conteudo: text,
  });

  const janela = await getJanela(session.usuarioSkillId, 20);
  const promptConteudo = buildMessages({
    systemPrompt: 'Você é o Gerente de Produção virtual da Alisson Joias. Auxilie o gerente da fábrica com consultas ao ERP (ordens de produção, estoque, produtos), registro de conhecimento sobre processos de fabricação, vocabulário interno e regras de priorização. Seja direto e conciso. Nunca invente informações — se não souber, diga que não sabe.',
    janela: janela.map((m) => ({ role: m.role, content: m.content })),
    mensagemAtual: text,
  }).map((m) => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: m.content,
  }));

  const promptHash = computePromptHash(promptConteudo.map((m) => m.content).join('\n'));
  const llm = getLLMProvider();

  let reply: string;
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await llm.chat({ messages: promptConteudo, maxTokens: 2000 });
    reply = result.content;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
  } catch {
    reply = 'Tive um problema técnico. Tente novamente em instantes. O time de desenvolvimento foi notificado.';
  }

  await insertConversa({
    usuarioSkillId: session.usuarioSkillId,
    role: 'assistant',
    conteudo: reply,
    tokensIn,
    tokensOut,
    promptVersao: promptHash,
    modelo: 'deepseek-chat',
  });

  await sendMessage(botSlug, chatId, reply);

  return 'ok';
}
