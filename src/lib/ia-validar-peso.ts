import sql from "@/lib/db";

export interface ResultadoValidacao {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
  provedor: string;
}

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const PROMPT_METAL = `Analise esta foto de uma balança de precisão usada em joalheria.
Extraia APENAS o peso exibido no display da balança.
Responda SOMENTE com JSON no formato: {"peso": 12.34, "unidade": "g", "confianca": "alta"}
Se não conseguir ler o peso: {"peso": null, "unidade": null, "confianca": "nenhuma"}
Nenhum texto adicional. Apenas o JSON.`;

// Prompt para pedras: lê valor em quilates (ct) da balança
const PROMPT_PEDRA_CT = `Analise esta foto de uma balança de precisão usada em joalheria para pesagem de pedras.
Leia o valor em quilates (ct) exibido no display da balança.
A balança pode exibir "ct" ou "CT" após o número.
Responda SOMENTE com JSON no formato: {"peso": 1.2500, "unidade": "ct", "confianca": "alta"}
Se não conseguir ler o valor: {"peso": null, "unidade": null, "confianca": "nenhuma"}
Nenhum texto adicional. Apenas o JSON.`;

// Manter o PROMPT original como alias para backward compat
const PROMPT = PROMPT_METAL;

function parseAIResponse(text: string): { peso: number | null; confianca: string } {
  // Tentativa 1: extrair bloco JSON de dentro de qualquer texto
  try {
    let clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    // Pegar o primeiro objeto JSON encontrado (Gemini às vezes envolve com texto)
    const jsonMatch = clean.match(/\{[\s\S]*?\}/);
    if (jsonMatch) clean = jsonMatch[0];
    const parsed = JSON.parse(clean) as { peso?: number | string | null; confianca?: string };
    const pesoRaw = parsed.peso;
    const peso =
      pesoRaw !== null && pesoRaw !== undefined
        ? parseFloat(String(pesoRaw).replace(",", "."))
        : null;
    if (peso !== null && !isNaN(peso)) {
      return { peso, confianca: parsed.confianca ?? "media" };
    }
  } catch {
    // cai no fallback abaixo
  }

  // Tentativa 2: extrair número decimal diretamente do texto (ex: "2.02 g")
  const numMatch = text.match(/\b(\d{1,4}[.,]\d{1,3})\b/);
  if (numMatch) {
    const peso = parseFloat(numMatch[1].replace(",", "."));
    if (!isNaN(peso)) return { peso, confianca: "baixa" };
  }

  return { peso: null, confianca: "nenhuma" };
}

export async function validarPesoBalanca(
  imagemBase64: string,
  mediaTypeRaw: string,
  pesoReferencia: number,               // metal: peso digitado (g) | pedra: peso_ct (ct) quando modo_ct=true, ou peso_g (g) quando modo_ct=false
  tipo: "metal" | "pedra" = "metal",
  modo_ct: boolean = false              // Sprint 3: true = IA lê ct diretamente; false = IA lê gramas (behavior original)
): Promise<ResultadoValidacao> {
  const mediaType = (mediaTypeRaw || "image/jpeg") as MediaType;

  // ── 1. Ler configurações do banco ───────────────────────────────────────────
  const config: Record<string, string> = {
    ia_ativa: "true",
    ia_provedor: "claude",
    ia_modelo_claude: "claude-haiku-4-5-20251001",
    ia_modelo_openai: "gpt-4o",
    ia_modelo_gemini: "gemini-2.5-flash",
    ia_margem_pedra_pct: "10",
  };

  try {
    const rows = await sql<{ chave: string; valor: string }[]>`
      SELECT chave, valor FROM alissonerp.configuracoes_sistema
      WHERE chave IN ('ia_ativa', 'ia_provedor', 'ia_modelo_claude', 'ia_modelo_openai', 'ia_modelo_gemini', 'ia_margem_pedra_pct')
    `;
    for (const r of rows) config[r.chave] = r.valor;
  } catch {
    // tabela ainda não existe — usa defaults acima
  }

  // ── 2. IA desabilitada → aceitar sem conferência ────────────────────────────
  if (config.ia_ativa === "false") {
    return {
      peso_digitado: pesoReferencia,
      peso_balanca: pesoReferencia,
      confianca: "skip",
      match: true,
      mensagem: "Validação IA desabilitada — peso aceito sem conferência.",
      provedor: "nenhum",
    };
  }

  const provedor = config.ia_provedor ?? "claude";

  // ── 3. Buscar API key (banco primeiro, env var como fallback pro Claude) ─────
  let apiKey: string | null = null;

  try {
    const secrets = await sql<{ valor_encrypted: string }[]>`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets
      WHERE chave = ${"ia_key_" + provedor}
    `;
    apiKey = secrets[0]?.valor_encrypted ?? null;
  } catch {
    // tabela ainda não existe
  }

  // Fallback env var (só Claude)
  if (!apiKey && provedor === "claude") {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  }

  if (!apiKey) {
    return {
      peso_digitado: pesoReferencia,
      peso_balanca: null,
      confianca: "nenhuma",
      match: false,
      mensagem: `API key do provedor "${provedor}" não configurada. Configure em Configurações > IA.`,
      provedor,
    };
  }

  // ── 4. Chamar o provedor ─────────────────────────────────────────────────────
  // Selecionar prompt: pedra em modo ct → PROMPT_PEDRA_CT; caso contrário → PROMPT_METAL
  const promptAtivo = (tipo === "pedra" && modo_ct) ? PROMPT_PEDRA_CT : PROMPT_METAL;

  let pesoBalanca: number | null = null;
  let confianca = "nenhuma";

  try {
    if (provedor === "claude") {
      const modelo = config.ia_modelo_claude ?? "claude-haiku-4-5-20251001";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 150,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: imagemBase64 } },
                { type: "text", text: promptAtivo },
              ],
            },
          ],
        }),
      });
      const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      ({ peso: pesoBalanca, confianca } = parseAIResponse(text));

    } else if (provedor === "openai") {
      const modelo = config.ia_modelo_openai ?? "gpt-4o";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 150,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mediaType};base64,${imagemBase64}` } },
                { type: "text", text: promptAtivo },
              ],
            },
          ],
        }),
      });
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content ?? "";
      ({ peso: pesoBalanca, confianca } = parseAIResponse(text));

    } else if (provedor === "gemini") {
      const modelo = config.ia_modelo_gemini ?? "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: mediaType, data: imagemBase64 } },
                  { text: promptAtivo },
                ],
              },
            ],
          }),
        }
      );
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };
      if (data.error) {
        console.error("[ia-validar-peso] Gemini API error:", data.error.message);
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      console.log("[ia-validar-peso] Gemini raw text:", JSON.stringify(text));
      ({ peso: pesoBalanca, confianca } = parseAIResponse(text));
      console.log("[ia-validar-peso] Gemini parsed:", { pesoBalanca, confianca });
    }
  } catch (err) {
    return {
      peso_digitado: pesoReferencia,
      peso_balanca: null,
      confianca: "nenhuma",
      match: false,
      mensagem: `Erro ao chamar ${provedor}: ${(err as Error).message}`,
      provedor,
    };
  }

  // ── 5. Comparar ──────────────────────────────────────────────────────────────
  let match: boolean;
  let mensagem: string;

  if (tipo === "metal") {
    // Tolerância zero: 0.005g (floating point + arredondamento de display)
    match = pesoBalanca !== null && Math.abs(pesoBalanca - pesoReferencia) < 0.005;
    mensagem = match
      ? `Peso confirmado: ${pesoBalanca}g`
      : pesoBalanca === null
      ? "Não foi possível ler o peso. Tente com foto mais nítida."
      : `Peso não confere. Digitado: ${pesoReferencia}g | Balança: ${pesoBalanca}g — Corrija o valor`;
  } else if (tipo === "pedra" && modo_ct) {
    // Pedra modo CT: IA leu ct da balança, pesoReferencia é peso_ct esperado
    const margemPct = parseFloat(config.ia_margem_pedra_pct ?? "10") / 100;
    const margemAbsoluta = pesoReferencia * margemPct;
    const diferenca = pesoBalanca !== null ? Math.abs(pesoBalanca - pesoReferencia) : Infinity;
    match = pesoBalanca !== null && diferenca <= margemAbsoluta;
    const margemDisplay = (margemPct * 100).toFixed(0);
    mensagem = match
      ? `CT dentro da margem — Esperado: ${pesoReferencia.toFixed(4)}ct | Balança: ${pesoBalanca!.toFixed(4)}ct | Dif: ${diferenca.toFixed(4)}ct (margem ${margemDisplay}%)`
      : pesoBalanca === null
      ? "Não foi possível ler o valor em ct. Tente com foto mais nítida."
      : `CT fora da margem — Esperado: ${pesoReferencia.toFixed(4)}ct | Balança: ${pesoBalanca.toFixed(4)}ct | Dif: ${diferenca.toFixed(4)}ct > margem ${margemDisplay}%`;
  } else {
    // Pedra: margem configurável (mode gramas — comportamento original)
    const margemPct = parseFloat(config.ia_margem_pedra_pct ?? "10") / 100;
    const margemAbsoluta = pesoReferencia * margemPct;
    const diferenca = pesoBalanca !== null ? Math.abs(pesoBalanca - pesoReferencia) : Infinity;
    match = pesoBalanca !== null && diferenca <= margemAbsoluta;
    const margemDisplay = (margemPct * 100).toFixed(0);
    mensagem = match
      ? `Peso dentro da margem — Calculado: ${pesoReferencia.toFixed(2)}g | Balança: ${pesoBalanca!.toFixed(2)}g | Dif: ${diferenca.toFixed(3)}g (margem ${margemDisplay}%)`
      : pesoBalanca === null
      ? "Não foi possível ler o peso. Tente com foto mais nítida."
      : `Peso fora da margem — Calculado: ${pesoReferencia.toFixed(2)}g | Balança: ${pesoBalanca.toFixed(2)}g | Dif: ${diferenca.toFixed(3)}g > margem ${margemDisplay}%`;
  }

  return {
    peso_digitado: pesoReferencia,
    peso_balanca: pesoBalanca,
    confianca,
    match,
    mensagem,
    provedor,
  };
}

