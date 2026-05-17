/**
 * POST /api/gestao-estoque/ai-chat
 * Proxy server-side para Gemini 2.5-flash (ALISSON AI).
 * Não expõe a API key pro client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GESTAO_ESTOQUE_AI_MODEL || "gemini-2.5-flash";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Cada chat consome tokens Gemini. 3/min e 30/hora por user.
  try {
    rateLimit(`gestao-estoque-ai:min:${user.id}`, 3, 60_000);
    rateLimit(`gestao-estoque-ai:hour:${user.id}`, 30, 60 * 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { text: "Configuração de GEMINI_API_KEY ausente no servidor." },
      { status: 200 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const message: string = String(body?.message ?? "").trim();
  const tableName: string = String(body?.tableName ?? "produtos");
  const schema: string = String(body?.schema ?? "public");
  const contextDataRaw = Array.isArray(body?.contextData) ? body.contextData : [];
  if (!message) return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });

  const dataSnapshot = contextDataRaw.slice(0, 50);

  const systemPrompt = `
Você é o ALISSON AI, um estrategista de dados sênior e CTO de uma joalheria de luxo.
Seu objetivo é analisar dados para garantir "Speed to Revenue" (Velocidade para Faturar).

CONTEXTO ATUAL:
Tabela: ${tableName} (Schema: ${schema})
Dados Visíveis (Amostra): ${JSON.stringify(dataSnapshot)}

DIRETRIZES:
1. Responda de forma concisa, profissional e orientada a negócios.
2. Se o usuário perguntar sobre dados, use a amostra JSON fornecida.
3. Se o usuário quiser "adicionar dados", sugira o formato JSON ideal ou simule o impacto desses dados na análise atual.
4. Identifique oportunidades de margem de lucro, estoque parado ou tendências de vendas.
5. Mantenha um tom sofisticado e direto.
  `.trim();

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("[ai-chat] Gemini falhou:", r.status, j?.error);
      return NextResponse.json(
        { text: "Falha na conexão neural com o modelo de IA." },
        { status: 200 }
      );
    }
    const text =
      j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? "").join("") ??
      "Não foi possível gerar uma resposta.";
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[ai-chat] erro:", err);
    return NextResponse.json(
      { text: "Erro interno ao consultar a IA." },
      { status: 200 }
    );
  }
}
