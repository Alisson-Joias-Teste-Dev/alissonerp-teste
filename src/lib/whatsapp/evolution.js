/**
 * Helper Evolution API — integração WhatsApp
 * Docs: https://doc.evolution-api.com
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "suporte_alisson";

const headers = () => ({
  "Content-Type": "application/json",
  apikey: EVOLUTION_API_KEY,
});

/**
 * Envia mensagem de texto simples via WhatsApp.
 * @param {string} telefone — número no formato 5511999999999
 * @param {string} texto
 */
export async function enviarMensagem(telefone, texto) {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ number: telefone, text: texto }),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Evolution] sendText falhou (${res.status}):`, body);
      return { ok: false, status: res.status };
    }

    return { ok: true };
  } catch (err) {
    console.error("[Evolution] sendText erro de rede:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Envia mensagem com botões. Faz fallback para texto simples se a API não suportar.
 * @param {string} telefone
 * @param {string} texto — texto principal
 * @param {Array<{id:string, title:string}>} botoes — máx 3 botões
 */
export async function enviarMensagemComBotoes(telefone, texto, botoes) {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendButtons/${EVOLUTION_INSTANCE}`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          number: telefone,
          title: "Alisson ERP",
          description: texto,
          footer: "",
          buttons: botoes.map((b) => ({ buttonId: b.id, buttonText: { displayText: b.title }, type: 1 })),
        }),
      }
    );

    if (!res.ok) {
      console.warn("[Evolution] sendButtons não suportado, usando sendText como fallback");
      return enviarMensagem(telefone, texto);
    }

    return { ok: true };
  } catch (err) {
    console.warn("[Evolution] sendButtons erro, usando fallback:", err.message);
    return enviarMensagem(telefone, texto);
  }
}

/**
 * Parseia o body do webhook da Evolution API.
 * Retorna null para mensagens que devem ser ignoradas.
 * @param {object} body — corpo do webhook
 * @returns {{ telefone: string, mensagem: string, nome: string, messageId: string } | null}
 */
export function parsearWebhook(body) {
  try {
    // Ignorar eventos que não são de mensagem
    if (!body || body.event !== "messages.upsert") return null;

    const data = body.data;
    if (!data) return null;

    const msg = data.message || data.messages?.[0];
    if (!msg) return null;

    // Ignorar mensagens próprias
    if (msg.key?.fromMe) return null;

    // Ignorar grupos
    const remoteJid = msg.key?.remoteJid || "";
    if (remoteJid.endsWith("@g.us")) return null;

    // Extrair texto da mensagem
    const mensagem =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
      null;

    if (!mensagem || !mensagem.trim()) return null;

    // Limpar telefone
    const telefone = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
    if (!telefone) return null;

    const nome = msg.pushName || data.pushName || "Desconhecido";
    const messageId = msg.key?.id || "";

    return { telefone, mensagem: mensagem.trim(), nome, messageId };
  } catch (err) {
    console.error("[Evolution] parsearWebhook erro:", err);
    return null;
  }
}
