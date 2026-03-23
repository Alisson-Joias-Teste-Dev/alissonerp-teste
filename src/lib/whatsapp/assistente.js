/**
 * Módulo do Assistente WhatsApp — integração Google Gemini API
 * ATENÇÃO: usa Gemini (NÃO Anthropic/Claude)
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent
 * Auth: header x-goog-api-key
 * Role do assistente: "model" (não "assistant")
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const WA_MODEL = process.env.WA_MODEL || "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Mapeamento de roles para nome legível
const ROLE_LABELS = {
  ourives: "Ourives",
  consultora: "Consultora",
  gerente_fabrica: "Gerente de Fábrica",
  gerente_loja: "Gerente de Loja",
  logistica: "Logística",
  motoboy: "Motoboy",
  pcp: "PCP",
  admin: "Administrador",
  desenvolvedor: "Desenvolvedor",
  desconhecido: "Usuário não identificado",
};

/**
 * Monta o system prompt injetando contexto do usuário e knowledge base.
 */
function buildSystemPrompt(usuario, knowledgeBase) {
  const roleLabel = ROLE_LABELS[usuario.role] || usuario.role || "Usuário não identificado";

  const kbText = knowledgeBase.length > 0
    ? knowledgeBase.map((kb) => `[${kb.categoria.toUpperCase()}] ${kb.titulo}:\n${kb.conteudo}`).join("\n\n")
    : "Nenhuma base de conhecimento disponível no momento.";

  return `Você é o assistente de suporte do Alisson ERP — sistema de gestão para a Joalheria Alisson.

USUÁRIO ATUAL:
- Nome: ${usuario.nome || "Desconhecido"}
- Cargo: ${roleLabel}
- Telefone: ${usuario.telefone}

CONTEXTO DO SISTEMA:
O Alisson ERP é um sistema de gestão para uma joalheria de alto padrão. Ele cobre: produção de joias (PCP, distribuição, apontamentos), logística (protocolo de envio/retorno de peças), estoque de ouro e pedras preciosas, precificação, catálogo de produtos, e relatórios gerenciais.

O QUE VOCÊ PODE FAZER:
- Explicar como usar telas e funcionalidades do sistema
- Ajudar com dúvidas sobre processos e fluxos de trabalho
- Orientar sobre erros comuns e como resolvê-los
- Responder perguntas sobre o que cada cargo pode acessar
- Receber sugestões de melhorias

O QUE VOCÊ NÃO PODE FAZER:
- Modificar dados no sistema (você só orienta)
- Acessar informações confidenciais de outros usuários
- Revelar detalhes técnicos do banco de dados, nomes de tabelas ou SQL
- Dar suporte a problemas fora do escopo do ERP

REGRAS DE COMUNICAÇÃO:
- Máximo 500 caracteres por mensagem (limite do WhatsApp)
- Se precisar de mais espaço, divida em partes numeradas
- Adapte a linguagem ao cargo: ourives = linguagem prática e direta; gerente = linguagem mais completa; consultora = linguagem comercial
- Nunca exponha termos técnicos como SQL, IDs de tabela, ou nomes de colunas
- Seja sempre educado e objetivo

BASE DE CONHECIMENTO:
${kbText}

REGRAS DE ESCALAÇÃO:
Escale para o suporte humano (Jonathan) quando:
1. A dúvida não está na base de conhecimento e você não tem certeza
2. O usuário reporta um bug ou comportamento inesperado do sistema
3. O usuário faz uma sugestão de melhoria
4. A situação é urgente ou crítica para o negócio

QUANDO ESCALAR, responda no seguinte formato EXATO (não modifique os campos):
\`\`\`escalacao
{
  "tipo": "duvida|bug|sugestao|urgente",
  "resumo": "descrição concisa em 1-2 frases",
  "analise": "análise técnica ou detalhes relevantes (especialmente para sugestões)"
}
\`\`\`

Após o bloco de escalação, escreva a mensagem que o usuário verá enquanto aguarda o suporte.

IMPORTANTE: Responda SEMPRE em português brasileiro.`;
}

/**
 * Converte histórico de wa_conversas para o formato de contents do Gemini.
 * Garante alternância user/model e que começa com user.
 */
function buildContents(historico, mensagemAtual) {
  const rawContents = historico.map((msg) => ({
    role: msg.direcao === "entrada" ? "user" : "model",
    parts: [{ text: msg.mensagem }],
  }));

  // Adicionar mensagem atual
  rawContents.push({ role: "user", parts: [{ text: mensagemAtual }] });

  // Deduplicar mensagens consecutivas do mesmo role (concatenar)
  const contents = [];
  for (const item of rawContents) {
    const last = contents[contents.length - 1];
    if (last && last.role === item.role) {
      last.parts[0].text += "\n" + item.parts[0].text;
    } else {
      contents.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
    }
  }

  // Garantir que começa com "user"
  while (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }

  return contents;
}

/**
 * Extrai o bloco de escalação da resposta do assistente.
 * Retorna { textoLimpo, escalacao } onde escalacao é null se não há escalação.
 */
function extrairEscalacao(textoResposta) {
  const regex = /```escalacao\s*([\s\S]*?)```/i;
  const match = textoResposta.match(regex);

  if (!match) return { textoLimpo: textoResposta.trim(), escalacao: null };

  try {
    const json = JSON.parse(match[1].trim());
    const tiposValidos = ["duvida", "bug", "sugestao", "urgente"];
    if (!tiposValidos.includes(json.tipo)) json.tipo = "duvida";

    const textoLimpo = textoResposta.replace(regex, "").trim();
    return { textoLimpo, escalacao: json };
  } catch {
    // JSON inválido no bloco — escalar como urgente
    const textoLimpo = textoResposta.replace(regex, "").trim();
    return {
      textoLimpo,
      escalacao: {
        tipo: "urgente",
        resumo: "Assistente tentou escalar mas o formato da resposta estava inválido",
        analise: match[1],
      },
    };
  }
}

/**
 * Processa uma mensagem do usuário via Gemini e retorna a resposta estruturada.
 *
 * @param {object} params
 * @param {string} params.mensagem — mensagem atual do usuário
 * @param {object} params.usuario — { nome, role, telefone }
 * @param {Array}  params.historico — últimas N mensagens de wa_conversas
 * @param {Array}  params.knowledgeBase — registros de wa_knowledge_base
 *
 * @returns {Promise<{
 *   escalar: boolean,
 *   tipo_escalacao?: string,
 *   resumo_escalacao?: string,
 *   analise?: string,
 *   texto_usuario: string,
 *   tokens: { input: number, output: number }
 * }>}
 */
export async function processarMensagem({ mensagem, usuario, historico, knowledgeBase }) {
  const systemPrompt = buildSystemPrompt(usuario, knowledgeBase);
  const contents = buildContents(historico, mensagem);

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  };

  let data;
  try {
    const res = await fetch(
      `${GEMINI_BASE}/${WA_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[Assistente] Gemini API erro ${res.status}:`, errBody);
      return escalacaoDeErro("Erro na API do assistente. Jonathan foi notificado.", res.status);
    }

    data = await res.json();
  } catch (err) {
    console.error("[Assistente] Erro de rede/timeout:", err);
    return escalacaoDeErro("Não consegui processar sua mensagem agora. Jonathan foi notificado.", "network");
  }

  // Verificar candidates
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    console.error("[Assistente] Gemini sem candidates:", JSON.stringify(data));
    return escalacaoDeErro("Resposta vazia do assistente. Jonathan foi notificado.", "empty");
  }

  // Verificar safety block
  if (candidate.finishReason === "SAFETY") {
    console.warn("[Assistente] Resposta bloqueada por safety filters");
    return escalacaoDeErro("Não consegui responder a essa mensagem. Jonathan foi notificado.", "safety");
  }

  // Extrair texto
  const parts = candidate.content?.parts || [];
  const textoResposta = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();

  if (!textoResposta) {
    return escalacaoDeErro("Resposta vazia do assistente. Jonathan foi notificado.", "empty_text");
  }

  // Tokens
  const tokens = {
    input: data.usageMetadata?.promptTokenCount || 0,
    output: data.usageMetadata?.candidatesTokenCount || 0,
  };

  // Verificar escalação
  const { textoLimpo, escalacao } = extrairEscalacao(textoResposta);

  if (escalacao) {
    return {
      escalar: true,
      tipo_escalacao: escalacao.tipo,
      resumo_escalacao: escalacao.resumo || "Sem resumo",
      analise: escalacao.analise || "",
      texto_usuario: textoLimpo || "Sua mensagem foi encaminhada para o suporte. Em breve você receberá uma resposta.",
      tokens,
    };
  }

  return {
    escalar: false,
    texto_usuario: textoLimpo,
    tokens,
  };
}

/** Resposta padrão quando a API falha — escala como urgente */
function escalacaoDeErro(mensagemUsuario, codigo) {
  return {
    escalar: true,
    tipo_escalacao: "urgente",
    resumo_escalacao: `Falha técnica no assistente (código: ${codigo})`,
    analise: `O assistente não conseguiu processar a mensagem por erro técnico interno (${codigo}).`,
    texto_usuario: mensagemUsuario,
    tokens: { input: 0, output: 0 },
  };
}
