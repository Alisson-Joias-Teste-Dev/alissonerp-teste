/**
 * ZPL II generator for Zebra ZD500R RFID Printer.
 *
 * Label: Itag RFID 74x20mm @ 203dpi = ~582x158 dots
 * Protocol: TCP/IP direct to printer at port 9100 (Zebra default)
 *
 * EPC Format (12 chars ASCII = 24 hex = 96 bits):
 *   AJ{AA}{NNNNNNNN}
 *   AJ = prefixo fixed
 *   AA = ano (25 = 2025, 26 = 2026, etc)
 *   NNNNNNNN = sequencial 8 digitos
 */

export interface DadosEtiquetaRfid {
  epc:  string;  // ex: AJ2600000001
  sku:  string;  // ex: 1470-6
  nome: string;  // ex: Anel Aparador em Ouro Branco com Diamantes
}

function sanitizeZpl(input: string): string {
  return input
    .replace(/\^/g, " ")
    .replace(/~/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

export function epcToHex(epc: string): string {
  return Buffer.from(epc, "ascii").toString("hex").toUpperCase();
}

export function isEpcValido(epc: string): boolean {
  return /^AJ\d{2}\d{8}$/.test(epc);
}

/**
 * Gera ZPL para etiqueta RFID 74x20mm.
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │  Produto: Anel Ouro Branco                     │
 *   │  SKU: 1470-6          RFID: AJ2600000001       │
 *   │  ┌──────────────────┐                          │
 *   │  │    QR CODE       │                          │
 *   │  └──────────────────┘                          │
 *   └────────────────────────────────────────────────┘
 */
export function gerarZplEtiquetaJoia(dados: DadosEtiquetaRfid): string {
  if (!isEpcValido(dados.epc)) {
    throw new Error(`EPC invalido: ${dados.epc} (esperado AJ{AA}{NNNNNNNN})`);
  }

  const epcHex    = epcToHex(dados.epc);
  const skuLimpo  = sanitizeZpl(dados.sku);
  const nomeLimpo = sanitizeZpl(dados.nome);

  // Label 74x20mm @ 203dpi
  // ^PW580 = largura 580 dots (~73mm)
  // ^LL160 = altura 160 dots (~20mm)
  return (
    `^XA\n` +
    `^PW580\n` +
    `^LL160\n` +
    `^CI28\n` +                       // codificacao UTF-8
    `^FO10,10^A0N,22,22^FD${nomeLimpo}^FS\n` +  // Nome do produto (topo)
    `^FO10,40^A0N,18,18^FDSKU: ${skuLimpo}^FS\n` +  // SKU
    `^FO10,70^A0N,15,15^FDID: ${dados.epc}^FS\n` +  // EPC
    `^FO400,10^BQN,2,5^FDLA,${dados.epc}^FS\n` +  // QR Code
    `^RFW,H^FD${epcHex}^FS\n` +        // Grava EPC no chip RFID
    `^XZ`
  );
}

/**
 * Envia ZPL diretamente para impressora Zebra via TCP/IP.
 * @returns Promise que resolve quando a impressao for enviada
 */
export async function imprimirZplDireto(
  zpl: string,
  ip: string = "192.168.15.144",
  port: number = 9100
): Promise<void> {
  const net = await import("net");
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);

    socket.connect(port, ip, () => {
      socket.write(zpl, "utf8", () => {
        socket.end();
        resolve();
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(new Error(`Falha ao conectar na impressora ${ip}:${port} — ${err.message}`));
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Timeout ao conectar na impressora ${ip}:${port}`));
    });
  });
}
