/**
 * Dispatcher de webhooks — versão server-side (usa sql direto, não PostgREST)
 * Dispara de forma assíncrona sem bloquear a resposta da API.
 */

import sql from "@/lib/db";

interface WebhookResult {
  success: boolean;
  status?: number;
  error?: string;
}

export async function dispararWebhookServer(
  nome: string,
  payload: Record<string, unknown>
): Promise<WebhookResult> {
  const [config] = await sql<{ url: string; ativo: boolean }[]>`
    SELECT url, ativo
    FROM alissonerp.webhook_config
    WHERE nome = ${nome}
    LIMIT 1
  `;

  if (!config || !config.ativo || !config.url) {
    return { success: false, error: "Webhook não configurado ou inativo" };
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": nome,
        "X-Webhook-Timestamp": new Date().toISOString(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // timeout 10s
    });

    // Log assíncrono
    sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status)
      VALUES (${nome}, ${JSON.stringify(payload)}::jsonb, ${response.status})
    `.catch(() => {});

    // Atualiza ultima_execucao
    sql`
      UPDATE alissonerp.webhook_config
      SET ultima_execucao = NOW(), tentativas = tentativas + 1
      WHERE nome = ${nome}
    `.catch(() => {});

    return { success: response.ok, status: response.status };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);

    sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, erro)
      VALUES (${nome}, ${JSON.stringify(payload)}::jsonb, ${msg})
    `.catch(() => {});

    return { success: false, error: msg };
  }
}

/**
 * Dispara webhook em background — não awaita, não bloqueia a resposta.
 * Use quando o resultado do webhook não afeta a resposta da API.
 */
export function dispararWebhookBackground(
  nome: string,
  payload: Record<string, unknown>
): void {
  dispararWebhookServer(nome, payload).catch(() => {});
}
