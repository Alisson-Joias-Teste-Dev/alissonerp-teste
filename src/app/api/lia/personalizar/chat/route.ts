import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { createDeepSeekProvider } from "@/agentes/core/llm/deepseek";

/**
 * POST /api/lia/personalizar/chat
 *
 * Chat com a LIA para CONFIGURAR regras de personalização de produto.
 * A LIA é arquiteta de regras — o usuário descreve as regras desejadas,
 * a LIA confirma com o usuário e salva via POST /api/lia/personalizar/configurar.
 *
 * Body:
 * {
 *   produtoId: number,
 *   mensagens: Array<{ role: "user" | "assistant", content: string }>,
 *   mensagemAtual: string
 * }
 *
 * Response:
 * {
 *   reply: string,           // Texto da LIA
 *   acao?: "configurar",     // Se a LIA quer executar uma ação
 *   configPayload?: object,  // Payload pra POST /api/lia/personalizar/configurar
 *   tokensIn: number,
 *   tokensOut: number
 * }
 */

const SYSTEM_PROMPT_BASE = `Você é a LIA (Linguist Intelligent Assistant), Arquiteta de Personalização da Alisson Joias.

SUA FUNÇÃO:
Você ajuda o usuário a CONFIGURAR as regras de personalização de produtos (joias que podem ter nomes gravados, frases, iniciais, etc.).
O usuário descreve COMO ele quer que a personalização funcione, e você traduz isso em regras salvas no sistema.

Você NÃO sugere textos para gravação — você configura as REGRAS (quantos campos, preço, formatação).

O que você PODE fazer:
1. Perguntar ao usuário quantos campos de personalização ele quer (ex: 3 nomes gratis)
2. Perguntar o preço por campo adicional (ex: R$ 100 por nome extra)
3. Perguntar as regras de formatação (primeira letra maiúscula? sem números? sem símbolos?)
4. Perguntar o label do campo (ex: "Nome a gravar")
5. Perguntar mínimo e máximo de caracteres
6. Perguntar se o campo é obrigatório
7. Confirmar com o usuário e SALVAR as regras no sistema

REGRAS DE FORMATAÇÃO (perguntar ao usuário ou usar defaults):
- primeira_letra_maiuscula: true (default) — "Maria", não "maria" ou "MARIA"
- sem_espacos: false (default) — se true, remove espaços
- sem_numeros: true (default) — não permite números
- sem_simbolos: true (default) — não permite símbolos/pontuação
- sem_acentos: false (default) — se true, remove acentos

O que você NÃO PODE fazer:
- Não invente informações sobre o produto
- Não salve sem confirmação explícita do usuário
- Não sugira textos criativos para gravação — isso é com a consultora
- Não mude o tipo de personalização sem perguntar

FORMATO DE RESPOSTA:
Seja direta, calorosa e use emojis relacionados a joias 💍✨ quando apropriado.
Sempre confirme ANTES de salvar as regras.
Quando o usuário confirmar, use sua ferramenta de configurar personalização.`;

function buildSystemPrompt(produtoInfo: {
  nome: string;
  sku: string;
  tipo_personalizacao: string;
  label: string;
  min_caracteres: number;
  max_caracteres: number;
  caracteres_permitidos: string;
  preco_por_letra: number | null;
  peso_por_letra: number | null;
  exemplo: string | null;
  campos_gratis: number;
  preco_campo_adicional: number | null;
  regras?: {
    primeira_letra_maiuscula: boolean;
    sem_espacos: boolean;
    sem_numeros: boolean;
    sem_simbolos: boolean;
    sem_acentos: boolean;
  } | null;
}): string {
  const caracteresDesc: Record<string, string> = {
    alfa: "Apenas letras A-Z (sem acentos, sem números, sem espaços)",
    alfa_acento: "Letras com acentos (sem números, sem espaços)",
    alfa_acento_espaco: "Letras com acentos e espaços (sem números)",
    alfanum: "Letras e números",
    alfanum_acento_espaco: "Letras, números, acentos e espaços",
    numero: "Apenas números",
    qualquer: "Qualquer caractere",
  };

  const precoTexto = produtoInfo.preco_por_letra != null
    ? `R$ ${produtoInfo.preco_por_letra.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por letra`
    : "Preço padrão do produto (sem custo adicional por letra)";

  const pesoTexto = produtoInfo.peso_por_letra != null
    ? `${produtoInfo.peso_por_letra.toFixed(2)}g por letra`
    : "Peso padrão do produto";

  const configAtual = `CONFIGURAÇÃO ATUAL:
- Tipo: ${produtoInfo.tipo_personalizacao}
- Label: "${produtoInfo.label}"
- Mínimo de letras: ${produtoInfo.min_caracteres}
- Máximo de letras: ${produtoInfo.max_caracteres}
- Caracteres permitidos: ${caracteresDesc[produtoInfo.caracteres_permitidos] ?? produtoInfo.caracteres_permitidos}
- Campos gratis: ${produtoInfo.campos_gratis}
- Preço campo adicional: ${produtoInfo.preco_campo_adicional != null ? `R$ ${produtoInfo.preco_campo_adicional}` : "Não configurado"}
- ${precoTexto}
- ${pesoTexto}
${produtoInfo.exemplo ? `- Exemplo: "${produtoInfo.exemplo}"` : ""}
${produtoInfo.regras ? `- Regras: ${produtoInfo.regras.primeira_letra_maiuscula ? "1ª maiúscula" : "livre"}${produtoInfo.regras.sem_espacos ? ", sem espaços" : ""}${produtoInfo.regras.sem_numeros ? ", sem números" : ""}${produtoInfo.regras.sem_simbolos ? ", sem símbolos" : ""}${produtoInfo.regras.sem_acentos ? ", sem acentos" : ""}` : ""}`;

  return `${SYSTEM_PROMPT_BASE}

---
INFORMAÇÕES DO PRODUTO ATUAL:
- Nome: ${produtoInfo.nome}
- SKU: ${produtoInfo.sku}

${configAtual}
---

**IMPORTANTE:** Para salvar as configurações, você DEVE responder no seguinte formato JSON (sem texto extra):
{"acao":"configurar","payload":{...}}

O payload deve seguir este formato:
{
  "produtoId": NUMBER,
  "tipo": "nome",
  "label": "Nome a gravar",
  "obrigatorio": true,
  "min_caracteres": 1,
  "max_caracteres": 20,
  "caracteres_permitidos": "alfa_acento_espaco",
  "campos_gratis": 3,
  "preco_campo_adicional": 100,
  "preco_por_letra": null,
  "peso_por_letra": null,
  "regras": {
    "primeira_letra_maiuscula": true,
    "sem_espacos": false,
    "sem_numeros": true,
    "sem_simbolos": true,
    "sem_acentos": false
  }
}

SOMENTE use o formato JSON quando o usuário CONFIRMAR que quer salvar.
Antes disso, converse normalmente em português para entender as necessidades.
Após o JSON de confirmação, uma mensagem de sucesso aparecerá.`;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { produtoId?: unknown; mensagens?: unknown; mensagemAtual?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const produtoId = Number(body.produtoId);
  if (!Number.isFinite(produtoId) || produtoId <= 0) {
    return NextResponse.json({ error: "produtoId inválido" }, { status: 400 });
  }

  const mensagens = Array.isArray(body.mensagens) ? body.mensagens : [];
  const mensagemAtual = typeof body.mensagemAtual === "string" ? body.mensagemAtual.trim() : "";
  if (!mensagemAtual) {
    return NextResponse.json({ error: "mensagemAtual é obrigatória" }, { status: 400 });
  }

  try {
    // Busca dados do produto
    const [produto] = await sql`
      SELECT p.id_produto, p.nome, p.sku
      FROM public.produtos p
      WHERE p.id_produto = ${produtoId}
    `;
    if (!produto) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    // Busca config de personalização + regras
    const [config] = await sql`
      SELECT
        pp.tipo, pp.label, pp.min_caracteres, pp.max_caracteres,
        pp.caracteres_permitidos, pp.preco_por_letra, pp.peso_por_letra,
        pp.exemplo, pp.campos_gratis, pp.preco_campo_adicional,
        ppr.primeira_letra_maiuscula, ppr.sem_espacos,
        ppr.sem_numeros, ppr.sem_simbolos, ppr.sem_acentos
      FROM alissonerp.produto_personalizacao pp
      LEFT JOIN alissonerp.produto_personalizacao_regras ppr ON ppr.config_id = pp.id
      WHERE pp.produto_id = ${produtoId} AND pp.ativo = true
    `;

    const produtoInfo = {
      nome: String(produto.nome ?? ""),
      sku: String(produto.sku ?? ""),
      tipo_personalizacao: config?.tipo ?? "nome",
      label: config?.label ?? "Nome a gravar",
      min_caracteres: config ? Number(config.min_caracteres) : 1,
      max_caracteres: config ? Number(config.max_caracteres) : 20,
      caracteres_permitidos: config?.caracteres_permitidos ?? "alfa_acento_espaco",
      preco_por_letra: config?.preco_por_letra != null ? Number(config.preco_por_letra) : null,
      peso_por_letra: config?.peso_por_letra != null ? Number(config.peso_por_letra) : null,
      exemplo: config?.exemplo ? String(config.exemplo) : null,
      campos_gratis: config?.campos_gratis != null ? Number(config.campos_gratis) : 1,
      preco_campo_adicional: config?.preco_campo_adicional != null ? Number(config.preco_campo_adicional) : null,
      regras: config?.primeira_letra_maiuscula != null ? {
        primeira_letra_maiuscula: Boolean(config.primeira_letra_maiuscula),
        sem_espacos: Boolean(config.sem_espacos),
        sem_numeros: Boolean(config.sem_numeros),
        sem_simbolos: Boolean(config.sem_simbolos),
        sem_acentos: Boolean(config.sem_acentos),
      } : null,
    };

    const systemPrompt = buildSystemPrompt(produtoInfo);

    // Monta mensagens para o LLM
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Adiciona histórico de mensagens (máximo 20 para caber no contexto)
    const MAX_HISTORY = 20;
    const recentMessages = mensagens.slice(-MAX_HISTORY);
    for (const msg of recentMessages) {
      const role = msg.role === "assistant" ? "assistant" : "user";
      messages.push({ role, content: String(msg.content) });
    }

    // Adiciona mensagem atual
    messages.push({ role: "user", content: mensagemAtual });

    // Chama DeepSeek
    const llm = createDeepSeekProvider();
    const result = await llm.chat({
      messages,
      maxTokens: 2000,
    });

    // Verifica se a resposta é um JSON de ação
    const reply = result.content.trim();
    let acao: string | undefined;
    let configPayload: Record<string, unknown> | undefined;

    try {
      if (reply.startsWith("{") && reply.endsWith("}")) {
        const parsed = JSON.parse(reply);
        if (parsed.acao === "configurar" && parsed.payload) {
          acao = "configurar";
          configPayload = {
            ...parsed.payload,
            produtoId, // Garante que o produtoId seja o correto
          };
        }
      }
    } catch {
      // Não é JSON, resposta normal em texto
    }

    // Se for JSON de ação, retorna o payload
    if (acao && configPayload) {
      return NextResponse.json({
        reply: "Perfeito! Vou salvar as regras de personalização agora... 🔧",
        acao,
        configPayload,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });
    }

    // Resposta normal de texto
    return NextResponse.json({
      reply,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
  } catch (err) {
    console.error("[LIA Personalizar Chat]", err);
    return NextResponse.json(
      { error: "Erro interno ao processar chat com LIA" },
      { status: 500 },
    );
  }
}
