import { createClient } from "@/lib/supabase/client";

interface WebhookResult {
  success: boolean;
  status?: number;
  error?: string;
}

export async function dispararWebhook(
  nome: string,
  payload: Record<string, unknown> = {}
): Promise<WebhookResult> {
  const supabase = createClient();

  const { data: config } = await supabase
    .from("webhook_config")
    .select("url, ativo")
    .eq("nome", nome)
    .single();

  if (!config || !config.ativo) {
    return { success: false, error: "Webhook não encontrado ou inativo" };
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Registrar log + atualizar contador via RPC
    await supabase.rpc("fn_disparar_webhook", {
      p_nome: nome,
      p_payload: payload,
    });

    return { success: response.ok, status: response.status };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);

    // Registrar erro no log
    await supabase.from("webhook_log").insert({
      webhook_nome: nome,
      payload,
      erro: msg,
    });

    return { success: false, error: msg };
  }
}
