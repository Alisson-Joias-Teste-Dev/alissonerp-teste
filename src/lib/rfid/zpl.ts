/**
 * ZPL II generator for Zebra ZD500R RFID Printer.
 *
 * Label: 74×20mm @ 203dpi (592×160 dots)
 * RFID: UHF EPC Gen2 V2 / ISO 18000-63 / RAIN, ThingMagic encoder
 * EPC: 24-digit numeric hex (0-9 only), 96-bit format
 *
 * Protocol: Zebra Browser Print v1.3+ (HTTPS localhost:9101).
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

import {
  type Epc,
  type DadosEtiqueta,
  type EtiquetaModelo,
  EpcSchema,
  mmToDots,
} from "./tipos";
import { formatEpc, parseEpc } from "./epc";

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
 *   3. ^HV1,24,EPC: — devolve ao host "EPC:" + 24 caracteres hex (96 bits)
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
/** Layout físico da etiqueta — vem do modelo salvo (dimensões, offset, posição). */
export interface LayoutEtiqueta {
  larguraDots: number; // ^PW
  alturaDots: number; // ^LL
  offsetXDots: number; // ^LH x — deslocamento horizontal (ajuste da tela)
  offsetYDots: number; // ^LH y — deslocamento vertical
  posicaoRfid: string; // ^RS posição de programação calibrada, ex.: "F1"
}

/**
 * Gera o ZPL da etiqueta de joia (dobrável): metade de cima = SKU + nome;
 * metade de baixo = código de barras (número curto que o ERP resolve p/ o EPC)
 * + o EPC em texto pequeno. O chip RFID guarda o EPC completo.
 *
 * O `layout` (dimensões, offset via ^LH, posição do chip) vem do modelo salvo,
 * ajustado pela tela de calibração/layout — é o que faz a impressão cair
 * certinho na cabeça da tag.
 */
export function gerarZplEtiquetaJoia(
  dados: DadosEtiqueta,
  epc: Epc,
  codigoBarras: string,
  layout: LayoutEtiqueta,
): string {
  const parsed = EpcSchema.safeParse(epc);
  if (!parsed.success) {
    throw new Error(`EPC inválido: "${epc}" (esperado 24 dígitos numéricos)`);
  }

  const nome = sanitizeZpl(dados.nome);
  const sku = sanitizeZpl(dados.sku);
  const cb = sanitizeZpl(codigoBarras);
  const epcFmt = formatEpc(epc);
  const pos = (layout.posicaoRfid || "F0").trim(); // ex.: F1 (calibrado)
  const meio = Math.round(layout.alturaDots / 2); // linha do vinco (dobra)

  return [
    "^XA",
    "^CI28", // UTF-8
    `^PW${layout.larguraDots}`,
    `^LL${layout.alturaDots}`,
    // ^LH = label home: desloca TODA a etiqueta pelo X/Y do modelo (ajuste da tela).
    `^LH${layout.offsetXDots},${layout.offsetYDots}`,
    "^MMF", // modo RFID
    `^RS8,${pos},,3,N`, // posição de programação calibrada (ex.: F1)

    // --- Metade de cima (frente): SKU + nome ---
    `^FO8,10^A0N,24,24^FD${sku}^FS`,
    `^FO8,40^A0N,20,20^FD${nome}^FS`,

    // --- Metade de baixo (verso): código de barras (número curto) + EPC ---
    `^BY2^FO8,${meio + 6}^BCN,52,Y,N,N^FD${cb}^FS`,
    `^FO8,${meio + 82}^A0N,14,14^FDEPC ${epcFmt}^FS`,

    // --- RFID: grava (96 bits) → relê → devolve ao host p/ conferência ---
    // [CONFIRMADO: Zebra-RFID3 p.46-49 + Format 5]
    `^RFW,H^FD${epc}^FS`,
    "^RFR,H^FN1^FS",
    "^HV1,24,EPC:,^FS",

    "^XZ",
  ].join("\n");
}

/**
 * Monta o layout a partir de um modelo salvo e gera o ZPL da etiqueta de joia.
 * O código de barras é o SERIAL do EPC (número curto, único, que o ERP resolve).
 */
export function gerarZplJoiaDoModelo(
  dados: DadosEtiqueta,
  epc: Epc,
  modelo: EtiquetaModelo | null,
): string {
  const { serial } = parseEpc(epc);
  // Sem modelo salvo → defaults seguros da tag de joia (25×38mm, sem offset, F0).
  const layout: LayoutEtiqueta = {
    larguraDots: mmToDots(modelo?.largura_mm ?? 25),
    alturaDots: mmToDots(modelo?.altura_mm ?? 38),
    offsetXDots: mmToDots(modelo?.offset_x_mm ?? 0),
    offsetYDots: mmToDots(modelo?.offset_y_mm ?? 0),
    posicaoRfid: modelo?.posicao_rfid ?? "F0",
  };
  return gerarZplEtiquetaJoia(dados, epc, String(serial), layout);
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
  // Varredura AMPLA: começa no recuo máximo (B30) e vai até achar (auto),
  // com detecção automática de potência (A). O default (B20) não achou o chip
  // de joia no hardware; B30→auto achou. [CONFIRMADO: Zebra-RFID3 p.37-42, ^HR c,d,e]
  return "^XA\n^HR,,B30,A,A\n^XZ";
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
