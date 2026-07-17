/**
 * ZPL II generator for Zebra ZD500R RFID Printer.
 *
 * Label: 74×20mm @ 203dpi (592×160 dots)
 * RFID: UHF EPC Gen2 V2 / ISO 18000-63 / RAIN, ThingMagic encoder
 * EPC: 24-digit numeric hex (0-9 only), 96-bit format
 *
 * Protocol: TCP/IP raw (port 9100) or Zebra Browser Print (localhost:9100/9101).
 *
 * Each fact in this file is backed by:
 * - RFID Programming Guide 3, P1062165-05EN [Zebra-RFID3]
 * - ZPL II Programming Guide [Zebra-ZPL]
 * - ZD500R spec sheet + devtools KB
 *
 * Golden rules:
 * - NEVER emit legacy commands: ^WT, ^RT, ^RZ, ^RA, ^RM, ^RN, ^RE, ^RQ, ^WV
 * - EPC IS valid hex directly — NO Buffer.from, NO ASCII layer, NO epcToHex
 * - Sanitize nome/sku with sanitizeZpl before embedding in ^FD
 */

import { type Epc, type DadosEtiqueta, EpcSchema } from "./tipos";
import { formatEpc } from "./epc";

/**
 * Sanitiza uma string para uso seguro em comandos ZPL.
 *
 * - Substitui prefixos de comando ZPL (^ e ~) por espaços,
 *   pois não podem aparecer literais dentro de ^FD.
 *   [CONFIRMADO: Zebra-ZPL p.190 — ^FD "accepts any printable character
 *   except the ^ and ~ prefixes"]
 * - Remove caracteres de controle ASCII (0x00–0x1F, 0x7F).
 * - Aplica trim nas bordas.
 */
export function sanitizeZpl(input: string): string {
  return input
    .replace(/\^/g, " ")
    .replace(/~/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Gera ZPL completo para etiqueta RFID de joia (74×20mm).
 *
 * Layout visual:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Nome do Produto                                    │
 *   │  SKU: 1470-6                  ┌──────────────────┐  │
 *   │  ID: 1001-000000123-...       │                  │  │
 *   │                               │     QR Code      │  │
 *   │                               │                  │  │
 *   │                               └──────────────────┘  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Fluxo RFID (Zebra standard read-back verification):
 *   1. ^RFW,H  — grava EPC de 96 bits (12 bytes hex) no banco EPC
 *   2. ^RFR,H^FN1 — relê o EPC recém-gravado no campo 1
 *   3. ^HV1,12,EPC: — devolve ao host "EPC:" + 12 bytes para conferência
 *
 *   [CONFIRMADO: Zebra-RFID3 p.24-27 — "RFID Label Format 5:
 *   Encode Tag, Read Tag, and Return Results to Host"]
 *
 * @param dados - Dados da etiqueta (nome, sku, id_produto)
 * @param epc   - Código EPC de 24 dígitos numéricos.
 *                Os dígitos SÃO o hex a ser gravado (ex.: "1001…" → 0x10 0x01 …).
 * @returns String ZPL pronta para envio à impressora.
 * @throws Se o EPC não for um Epc válido (24 dígitos numéricos).
 */
export function gerarZplEtiquetaJoia(dados: DadosEtiqueta, epc: Epc): string {
  // Runtime validation — TypeScript branding is compile-time only.
  const parsed = EpcSchema.safeParse(epc);
  if (!parsed.success) {
    throw new Error(
      `EPC inválido: "${epc}" (esperado 24 dígitos numéricos)`,
    );
  }

  const nomeLimpo = sanitizeZpl(dados.nome);
  const skuLimpo = sanitizeZpl(dados.sku);
  const epcFormatado = formatEpc(epc);

  // O EPC já é hex numérico (só dígitos 0-9).
  // ^RFW,H interpreta cada par de caracteres como um byte hex direto.
  // NÃO usar Buffer.from / epcToHex — isso introduziria uma camada
  // ASCII indesejada (ex.: "1" → 0x31 em vez de nibble 0x1).
  const epcHex = epc;

  // Label 74×20mm @ 203dpi = 8 dots/mm:
  //   ^PW592 = 592 dots = 74 mm
  //   ^LL160 = 160 dots = 20 mm (> 16 mm mínimo de pitch RFID)
  //   [CONFIRMADO: ZD500R spec sheet — min encode pitch 16 mm]
  return [
    "^XA",
    // --- Setup da etiqueta ---
    "^CI28", // codificação UTF-8 [Zebra-ZPL p.157]
    "^PW592", // largura 592 dots = 74mm [Zebra-ZPL p.329]
    "^LL160", // altura 160 dots = 20mm [Zebra-ZPL p.294]
    "^MMF", // modo RFID (F = desktop RFID; A só para R110PAX4) [Zebra-ZPL p.305-306]
    "^RS8,,,3,N", // Gen2 (t=8), posição calibrada (p=F0 default),
    // 3 tentativas de encode (n=3), sem ação ao esgotar (e=N)
    // [CONFIRMADO: Zebra-RFID3 p.54-56]

    // --- Campos visuais ---
    // Nome do produto (topo, fonte escalável 20×20 dots)
    `^FO10,8^A0N,20,20^FD${nomeLimpo}^FS`,
    // SKU (linha do meio, 16×16 dots)
    `^FO10,36^A0N,16,16^FDSKU: ${skuLimpo}^FS`,
    // EPC ID formatado com hífens (linha inferior, 13×13 dots)
    `^FO10,58^A0N,13,13^FDID: ${epcFormatado}^FS`,
    // QR Code: model 2 (enhanced), magnification 4, error correction L (high-density)
    // ^FDLA, = error correction L + automatic data input [Zebra-ZPL p.129-131]
    `^FO380,5^BQN,2,4^FDLA,${epcHex}^FS`,

    // --- RFID: gravação + leitura de verificação + retorno ao host ---
    // Grava EPC 96-bit: ^RFW,H → operação W (write), formato H (hex),
    // banco E (EPC 96-bit, default). 24 dígitos hex = 12 bytes = 96 bits.
    // [CONFIRMADO: Zebra-RFID3 p.46-49]
    `^RFW,H^FD${epcHex}^FS`,
    // Relê o EPC gravado: associa ao campo 1 para uso com ^HV.
    // [CONFIRMADO: Zebra-RFID3 p.24-27, Format 5]
    "^RFR,H^FN1^FS",
    // Devolve ao host: 12 bytes (96 bits) do campo 1, prefixados com "EPC:".
    // [CONFIRMADO: Zebra-RFID3 p.43]
    "^HV1,12,EPC:,^FS",

    "^XZ",
  ].join("\n");
}

/**
 * Gera ZPL para calibração de tag RFID.
 *
 * Envia `^XA ^HR ^XZ` que dispara a tag calibration.
 * Duração: até ~5 minutos. A impressora move a mídia 1 mm por vez,
 * lê o TID para identificar o chip, calibra a posição de programação
 * e determina os melhores níveis de potência read/write.
 * Resultados são devolvidos ao host como uma tabela.
 *
 * Pré-requisitos: carregar mídia RFID, calibrar mídia (comprimento/gap),
 * fechar cabeçote, avançar ao menos uma etiqueta.
 *
 * [CONFIRMADO: Zebra-RFID3 p.37-42]
 */
export function gerarZplCalibracao(): string {
  return "^XA\n^HR\n^XZ";
}

/**
 * Gera ZPL para leitura do TID (Tag ID) da etiqueta RFID.
 *
 * Lê 8 bytes do banco TID (banco Gen2 2) e devolve ao host
 * com prefixo "TID:". O TID contém o identificador único do chip
 * (class identifier, fabricante, modelo, número de série) e é
 * imutável (permalocked de fábrica).
 *
 * Formato: ^RFR,H,0,8,2 → lê 8 bytes hex do banco TID a partir do bloco 0.
 * ^HV1,,TID:,^FS → devolve ao host com header "TID:" (64 bytes default).
 *
 * [CONFIRMADO: Zebra-RFID3 p.67 exemplo oficial de leitura de TID]
 * [CONFIRMADO: GS1-Gen2 6.3.2.1.3 — TID permalocked na fabricação]
 */
export function gerarZplLeituraTid(): string {
  return [
    "^XA",
    "^RFR,H,0,8,2^FN1^FS", // lê 8 bytes do TID (banco 2) no campo 1
    "^HV1,,TID:,^FS", // devolve ao host com header "TID:"
    "^XZ",
  ].join("\n");
}
