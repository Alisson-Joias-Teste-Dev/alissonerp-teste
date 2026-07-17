"use client";

/**
 * Integração com Zebra Browser Print via SDK JavaScript (client-side only).
 *
 * ATENÇÃO:
 *   Este módulo roda EXCLUSIVAMENTE no browser do PC da loja.
 *   NUNCA importe este arquivo em Server Components, API routes ou RSC.
 *   Ele acessa `window.BrowserPrint` — indisponível no servidor.
 *
 * Arquitetura:
 *   - Next.js no VPS (Hetzner, HTTPS) → serve a página ao browser.
 *   - Browser do PC da loja → SDK Browser Print carregado via <Script>
 *     em `/public/browser-print/`.
 *   - SDK se comunica com o agente Browser Print local via
 *     https://localhost:9101 (v1.3+, certificado confiável).
 *   - O VPS NUNCA fala diretamente com a impressora.
 *
 * Browser Print v1.3+:
 *   - Porta HTTPS 9101 com certificado confiável (fim do mixed-content).
 *   - Dispositivos descobertos pelo agente; site autorizado via Accepted Hosts.
 *
 * Instalar agente:
 *   https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html
 *
 * Referências:
 *   - Browser Print User Guide v1.3 (2020)
 *   - doc-zebra-zd500r-devtools.md, seção 4
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Dispositivo Zebra descoberto pelo Browser Print (dados expostos pela SDK). */
export interface ZebraDevice {
  name: string;
  uid: string;
  connection: string; // 'usb' | 'network' | 'driver'
  deviceType: string; // 'printer'
  manufacturer?: string;
  version?: number;
  provider?: string;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Browser Print não está instalado/rodando no PC do usuário. */
export class BrowserPrintNaoInstaladoError extends Error {
  constructor() {
    super(
      "Zebra Browser Print não está rodando neste computador. " +
        "Instale em https://www.zebra.com/browser-print",
    );
    this.name = "BrowserPrintNaoInstaladoError";
  }
}

/** Falha de comunicação com o dispositivo Zebra (envio, leitura, desconexão). */
export class BrowserPrintErroDispositivoError extends Error {
  constructor(detalhe: string) {
    super(`Falha ao comunicar com a impressora Zebra: ${detalhe}`);
    this.name = "BrowserPrintErroDispositivoError";
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Obtém a referência ao namespace global do Browser Print SDK.
 *
 * O SDK deve ter sido carregado previamente como:
 *   <Script src="/browser-print/BrowserPrint-x.x.x.min.js" />
 *
 * @throws {BrowserPrintNaoInstaladoError} se `window.BrowserPrint` não existir.
 */
export function getBrowserPrint(): any {
  if (typeof window === "undefined") {
    throw new BrowserPrintNaoInstaladoError();
  }

  const bp = (window as any).BrowserPrint;
  if (!bp) {
    throw new BrowserPrintNaoInstaladoError();
  }

  return bp;
}

/**
 * Lista todas as impressoras Zebra descobertas pelo agente Browser Print
 * no PC local.
 *
 * @returns Array de dispositivos; array vazio se nenhum for encontrado.
 * @throws {BrowserPrintNaoInstaladoError} se o SDK não estiver disponível.
 */
export async function listarImpressoras(): Promise<ZebraDevice[]> {
  const bp = getBrowserPrint();

  return new Promise<ZebraDevice[]>((resolve, reject) => {
    bp.getLocalDevices(
      (devices: ZebraDevice[]) => {
        resolve(Array.isArray(devices) ? devices : []);
      },
      (err: any) => {
        reject(
          new BrowserPrintErroDispositivoError(
            err?.message ?? String(err),
          ),
        );
      },
    );
  });
}

/**
 * Retorna a impressora Zebra padrão configurada no Browser Print.
 *
 * @returns Dispositivo padrão ou null se nenhum estiver definido.
 * @throws {BrowserPrintNaoInstaladoError} se o SDK não estiver disponível.
 */
export async function impressoraPadrao(): Promise<ZebraDevice | null> {
  const bp = getBrowserPrint();

  return new Promise<ZebraDevice | null>((resolve) => {
    bp.getDefaultDevice(
      "printer",
      (device: ZebraDevice | null | undefined) => {
        resolve(device ?? null);
      },
      (_err: any) => {
        // Nenhuma impressora padrão configurada — não é erro fatal
        resolve(null);
      },
    );
  });
}

/**
 * Envia ZPL à impressora e aguarda a resposta (read-back verification).
 *
 * Este é o método principal do fluxo RFID: envia o ZPL (que contém
 * `^RFW` + `^RFR` + `^HV`) e lê a resposta da impressora contendo
 * o EPC lido, status SGD, e/ou log RFID.
 *
 * **Timeout (padrão 15s):** cobre envio + processamento + leitura.
 * Se o tempo esgotar, retorna o que foi lido até o momento (pode ser parcial).
 *
 * @param device    Dispositivo Zebra (obtido de listarImpressoras/impressoraPadrao).
 * @param zpl       String ZPL a ser enviada (deve incluir comando ^HV de retorno).
 * @param timeoutMs Tempo máximo total em ms (default 15000).
 * @returns String crua da resposta da impressora (para ser interpretada por verificacao.ts).
 * @throws {BrowserPrintErroDispositivoError} se o envio falhar.
 */
export async function enviarEVerificar(
  device: ZebraDevice,
  zpl: string,
  timeoutMs = 15000,
): Promise<string> {
  const dev = device as any;
  const deadline = Date.now() + timeoutMs;

  // 1 — Enviar ZPL (pode lançar BrowserPrintErroDispositivoError)
  await sendZpl(dev, zpl);

  // 2 — Aguardar um curto período para a impressora processar
  await sleep(Math.min(timeoutMs * 0.2, 2000));

  // 3 — Loop de leitura até deadline ou até não haver mais dados
  let acumulado = "";
  let vazioConsecutivo = 0;

  while (Date.now() < deadline) {
    const restante = deadline - Date.now();
    if (restante <= 0) break;

    const chunk = await readWithTimeout(dev, Math.min(restante, 5000));

    if (chunk) {
      acumulado += chunk;
      vazioConsecutivo = 0;
      // Continua lendo — a impressora pode enviar mais dados
    } else {
      vazioConsecutivo++;

      if (acumulado && vazioConsecutivo >= 2) {
        // Já temos dados e duas leituras consecutivas vieram vazias
        break;
      }

      // Ainda não temos nada ou ainda não batemos o limite de vazios
      await sleep(500);
    }
  }

  return acumulado;
}

/**
 * Envia ZPL genérico à impressora e lê a resposta.
 *
 * Útil para comandos de calibração (`^HR`), leitura de TID, status, etc.
 * Timeout generoso (5 min) pois a calibração pode durar até ~5 min.
 *
 * @param device Dispositivo Zebra.
 * @param zpl    String ZPL a ser enviada.
 * @returns String crua da resposta da impressora.
 * @throws {BrowserPrintErroDispositivoError} se o envio falhar.
 */
export async function enviarComando(
  device: ZebraDevice,
  zpl: string,
): Promise<string> {
  // 5 minutos (calibração pode levar até ~5 min)
  return enviarEVerificar(device, zpl, 300_000);
}

// ---------------------------------------------------------------------------
// Helpers internos (promisify dos callbacks da SDK)
// ---------------------------------------------------------------------------

/**
 * Envia ZPL ao dispositivo via Browser Print SDK.
 *
 * Wrapper de `device.send(data, successCb, errorCb)`.
 *
 * @throws {BrowserPrintErroDispositivoError} se o envio falhar.
 */
function sendZpl(dev: any, zpl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    dev.send(
      zpl,
      () => resolve(),
      (err: any) => {
        reject(
          new BrowserPrintErroDispositivoError(
            err?.message ?? String(err),
          ),
        );
      },
    );
  });
}

/**
 * Lê a resposta da impressora via Browser Print SDK, com timeout individual.
 *
 * Wrapper de `device.read(successCb, errorCb)`.
 * Se a leitura falhar ou o timeout estourar, retorna string vazia (não lança).
 *
 * @param dev       Objeto device (runtime) do Browser Print.
 * @param timeoutMs Tempo máximo de espera para esta leitura individual.
 * @returns Dados lidos ou "".
 */
function readWithTimeout(dev: any, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve("");
      }
    }, timeoutMs);

    dev.read(
      (data: string) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(typeof data === "string" ? data : String(data ?? ""));
        }
      },
      (_err: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(""); // Erro de leitura → retorna vazio, não lança
        }
      },
    );
  });
}

/** Promise-based sleep. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
