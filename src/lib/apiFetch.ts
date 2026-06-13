/**
 * apiFetch — wrapper sobre fetch que NUNCA engole erros.
 *
 * - Lança Error em falhas de rede (offline, timeout, CORS)
 * - Lança Error em respostas não-2xx, extraindo a mensagem do body JSON
 * - Tipado: apiFetch<MinhaType>("/api/...") retorna Promise<MinhaType>
 *
 * Use em lugar de fetch() direto em qualquer chamada de API.
 */
import { traduzErroOperacional } from "@/lib/erros-operacionais";

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(
      "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
    );
  }

  if (!res.ok) {
    // Tentar extrair mensagem do body JSON
    let msg = `Erro ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      msg = data.error ?? data.message ?? msg;
    } catch {
      /* body não é JSON — mantém msg genérica */
    }
    // Traduz erros operacionais (prefixos técnicos do banco) p/ texto claro.
    throw new Error(traduzErroOperacional(msg));
  }

  // 204 No Content — sem body
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
