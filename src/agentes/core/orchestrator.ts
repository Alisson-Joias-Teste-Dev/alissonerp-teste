import { parseUpdate } from './telegram/parse';
import { handleMedia } from './telegram/ignore-media';
import { sendMessage } from './telegram/send';
import { handleAuthFlow } from './auth/login-telegram';
import { verifyAndRenewToken } from './auth/verify-token';
import { getJanela, insertConversa } from './memory/conversas';
import { buildMessages, computePromptHash } from './prompt/builder';
import { getLLMProvider } from './llm';
import { checkRateLimit } from './rate-limit/check';
import { registerAllTools } from './tools/registry';
import type { TelegramUpdate } from '../shared/tipos';

let toolsRegistered = false;

async function ensureTools() {
  if (!toolsRegistered) {
    await registerAllTools();
    toolsRegistered = true;
  }
}

const SYSTEM_PROMPT = `Você é o Gerente de Produção virtual da Alisson Joias.
Você tem acesso ao banco de dados ERP em tempo real. Use as ferramentas disponíveis para consultar:

- ORDENS DE PRODUÇÃO: listar ordens abertas, detalhar uma ordem específica
- ESTOQUE: consultar saldo de ouro e outros insumos
- PRODUTOS: buscar produtos cadastrados por nome ou SKU
- PROCESSOS: consultar processo de fabricação de um produto
- APONTAMENTOS: sugerir apontamentos para revisão

Sempre que o gerente perguntar sobre dados do ERP, utilize as ferramentas disponíveis.
Seja direto e conciso — o gerente está na fábrica.
Nunca invente informações. Se os dados retornarem vazios, informe claramente.`;

export async function processUpdate(rawBody: TelegramUpdate, botSlug: string): Promise<string> {
  await ensureTools();

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
    console.log(`[auth] chat=${chatId} reply="${authResult.reply.substring(0, 50)}..."`);
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
    systemPrompt: SYSTEM_PROMPT,
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
    const result = await llm.chat({
      messages: promptConteudo,
      maxTokens: 2000,
      usuarioSkillId: session.usuarioSkillId,
    });
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
