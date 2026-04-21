/**
 * Integracao com Zebra Browser Print (utilitario local instalado no PC do usuario).
 *
 * Arquitetura:
 *   O app Next.js roda no servidor (Hetzner). O Browser Print roda no notebook
 *   da fabrica, expondo a impressora USB via HTTP em 127.0.0.1:9100.
 *   Como o fetch acontece no BROWSER (lado do cliente), o 127.0.0.1 resolve
 *   para a maquina local do usuario — nao para o Hetzner.
 *
 * Instalar: https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html
 *
 * Sem dependencias de SDK externo — usa fetch direto na API REST da Zebra.
 */

const BROWSER_PRINT_URL = "http://127.0.0.1:9100";

export interface ZebraDevice {
  name: string;
  uid: string;
  connection: string;     // 'usb' | 'network' | 'driver'
  deviceType: string;     // 'printer'
  manufacturer?: string;
  version?: number;
  provider?: string;
}

export class BrowserPrintNaoInstaladoError extends Error {
  constructor() {
    super(
      "Zebra Browser Print nao esta rodando neste computador. Instale em https://www.zebra.com/browser-print",
    );
    this.name = "BrowserPrintNaoInstaladoError";
  }
}

export class BrowserPrintErroDispositivoError extends Error {
  constructor(detalhe: string) {
    super(`Falha ao imprimir na Zebra: ${detalhe}`);
    this.name = "BrowserPrintErroDispositivoError";
  }
}

/**
 * Detecta se o erro de fetch indica que o Browser Print nao esta rodando.
 * "Failed to fetch" (Chrome), "NetworkError" (Firefox), "Load failed" (Safari).
 */
function eFetchNetworkError(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("load failed")
  );
}

/**
 * Lista todas as impressoras Zebra disponiveis no PC local.
 */
export async function listarImpressoras(): Promise<ZebraDevice[]> {
  try {
    const res = await fetch(`${BROWSER_PRINT_URL}/available`, {
      method: "GET",
      // Evita CORS preflight em alguns setups; Browser Print permite simple requests
      credentials: "omit",
    });
    if (!res.ok) {
      throw new Error(`Browser Print retornou ${res.status}`);
    }
    const data = (await res.json()) as { printer?: ZebraDevice[] };
    return data?.printer ?? [];
  } catch (e) {
    if (eFetchNetworkError(e)) throw new BrowserPrintNaoInstaladoError();
    throw e;
  }
}

/**
 * Retorna a impressora Zebra padrao definida no Browser Print.
 * Null se nenhuma estiver configurada.
 */
export async function impressoraPadrao(): Promise<ZebraDevice | null> {
  try {
    const res = await fetch(
      `${BROWSER_PRINT_URL}/default?type=printer`,
      { method: "GET", credentials: "omit" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ZebraDevice | null;
    return data ?? null;
  } catch (e) {
    if (eFetchNetworkError(e)) throw new BrowserPrintNaoInstaladoError();
    return null;
  }
}

/**
 * Envia string ZPL ao dispositivo Zebra selecionado.
 * Lanca BrowserPrintErroDispositivoError se falhar.
 */
export async function enviarZpl(
  device: ZebraDevice,
  zpl: string,
): Promise<void> {
  try {
    const res = await fetch(`${BROWSER_PRINT_URL}/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ device, data: zpl }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BrowserPrintErroDispositivoError(
        `${res.status} ${res.statusText} ${text}`.trim(),
      );
    }
  } catch (e) {
    if (eFetchNetworkError(e)) throw new BrowserPrintNaoInstaladoError();
    if (e instanceof BrowserPrintErroDispositivoError) throw e;
    throw new BrowserPrintErroDispositivoError(
      e instanceof Error ? e.message : String(e),
    );
  }
}
