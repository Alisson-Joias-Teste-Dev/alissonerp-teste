/**
 * ZPL II generator for Zebra ZD500R RFID Printer.
 *
 * Etiqueta de joia "bandeira + rabo" (liner 70×35mm, 203dpi):
 *  - Dois lobos à esquerda (frente + verso) que são COLADOS costas-com-costas
 *    → dupla face. O rabo fino (à direita) fica em branco (só amarra).
 *  - FRENTE (lobo de cima): SKU (OCR-B), nome do produto (fonte D), EPC em texto.
 *  - VERSO (lobo de baixo, impresso 180° p/ ler certo depois de colar):
 *    "Alisson" + logo do leão (bitmap ^GFA já girado 180°).
 *  - Sem código de barras / sem QR: a peça é controlada pelo chip (EPC).
 *
 * Enquadramento (validado no hardware, modo térmico, e mantido no chip):
 *  - ^PW576 é o que joga o conteúdo pro lugar certo na largura (essa firmware
 *    IGNORA ^LS e left_position; o ^PW é o único lever de posição horizontal).
 *  - ^LL568 (o gap da mídia limita o comprimento real).
 *  - Darkness fica em ~SD11, PERSISTIDO na impressora via `~SD11 ^XA^JUS^XZ`
 *    (print.tone/media.darkness são espelho/legado nessa ZD500R — não queimam o
 *    elemento). NÃO emitir ~SD/^MD por etiqueta p/ não somar em cima do salvo.
 *  - ^PRB = 3 ips (bordas mais nítidas p/ texto pequeno).
 *
 * RFID: UHF EPC Gen2 V2 / ISO 18000-63 / RAIN, ThingMagic encoder.
 * EPC: 24-digit numeric hex (0-9), 96-bit.
 *
 * Golden rules:
 * - NEVER emit legacy commands: ^WT, ^RT, ^RZ, ^RA, ^RM, ^RN, ^RE, ^RQ, ^WV
 * - EPC IS valid hex directly — NO Buffer.from, NO ASCII layer, NO epcToHex
 * - Sanitize nome/sku with sanitizeZpl before embedding in ^FD
 *
 * Referências: RFID Programming Guide 3 [Zebra-RFID3], ZPL II Programming Guide
 * [Zebra-ZPL], dossiês em .claude/zebra-zd500r-kb.
 */

import {
  type Epc,
  type DadosEtiqueta,
  type EtiquetaModelo,
  EpcSchema,
  mmToDots,
} from "./tipos";
import { formatEpc } from "./epc";

/**
 * Logo do leão (logo.leaoverde.webp) convertida em bitmap monocromático 1-bit
 * (threshold ~210, ~53×42 dots) e JÁ GIRADA 180° para o lobo do verso — o ^GFA
 * imprime como está (não gira por orientação de campo). Constante embutida p/
 * não depender de asset em runtime.
 */
const LOGO_LEAO_GFA =
  "^GFA,294,294,7,0001FF1FE3FE000000FF0FE1FE0000007F07F0FE0001001F01F07E0003001F01F83E0007001F01FC7E000F003F01F8FE000F003F01F1FE0007FF3F01E3FE0007FF3FC0C7FE0003F83FF00FFE0001C0FFFE1FFE000007FFFFFFFC00001FFFFFFFFC0000FFFFFFFFF80001FFFFFFFFF80003FFFFFFFFF00007FFFFFFFFF00007FFFFFFFFFE000FFFFFFFFFFF801FFFFFFFFF03C00FFFFFFFFC00E00FFFFC000000700FFFFC000000307FFFF8000000387FFFE0000000187FFFC000000018FFFF8000000018FFFFC0000000187FFF80000000181FFF00000000300FFE00000001F00FF800000003E00FFC00000007C00FF00000000780046000000002000000000000000007F8000000000004E800000000000844000000000000C0000000000000000000000000";

/**
 * CONFIG DE IMPRESSÃO — single source of truth no sistema (NÃO PODE se perder).
 * Valores descobertos/validados no hardware da ZD500R:
 *  - DARKNESS: o lever REAL é `~SD` (absoluto, 0-30). `print.tone`/`media.darkness`
 *    são espelho/legado (mexer neles NÃO clareia). Emitido pelo sistema em TODO
 *    job (`~SD11`) p/ não depender do que está salvo na impressora — se a
 *    impressora resetar/for trocada, a config continua vindo do código.
 *    [CONFIRMADO: agente zebra-zd500r vs Zebra-ZPL p.331-332]
 *  - ^PW576: enquadramento horizontal (essa firmware IGNORA ^LS/^LH/left_position;
 *    ^PW é o único lever — ^PW maior empurra o conteúdo p/ a esquerda).
 *  - ^LL568: gap da mídia limita o comprimento real.
 *  - ^PRB: 3 ips (bordas mais nítidas p/ texto pequeno).
 */
const DARKNESS = "~SD11";
const PRINT_WIDTH = "^PW576";
const LABEL_LENGTH = "^LL568";
const PRINT_SPEED = "^PRB";

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

/** Layout físico da etiqueta — vem do modelo salvo. Nesta ZD500R só a posição
 * de programação do chip (^RS) é usada em runtime; as dimensões/offset ficam no
 * modelo p/ referência (o enquadramento horizontal é fixo via ^PW576, porque a
 * firmware ignora ^LS/^LH/left_position). */
export interface LayoutEtiqueta {
  larguraDots: number;
  alturaDots: number;
  offsetXDots: number;
  offsetYDots: number;
  posicaoRfid: string; // ^RS posição de programação calibrada, ex.: "F1"
}

/**
 * Gera o ZPL da etiqueta de joia (dupla face colada, SEM dobra/barcode):
 *   - FRENTE (lobo de cima): SKU em OCR-B, nome em fonte D, EPC em texto.
 *   - VERSO (lobo de baixo, 180°): "Alisson" + logo do leão.
 * O chip RFID guarda o EPC completo (grava → relê → devolve ao host).
 *
 * @param dados  - nome, sku, id_produto
 * @param epc    - EPC de 24 dígitos numéricos (os dígitos SÃO o hex gravado)
 * @param layout - modelo salvo; usa `posicaoRfid` no ^RS
 * @throws Se o EPC não for um Epc válido (24 dígitos numéricos).
 */
export function gerarZplEtiquetaJoia(
  dados: DadosEtiqueta,
  epc: Epc,
  layout: LayoutEtiqueta,
): string {
  const parsed = EpcSchema.safeParse(epc);
  if (!parsed.success) {
    throw new Error(`EPC inválido: "${epc}" (esperado 24 dígitos numéricos)`);
  }

  const nome = sanitizeZpl(dados.nome);
  const sku = sanitizeZpl(dados.sku);
  const epcFmt = formatEpc(epc);
  const pos = (layout.posicaoRfid || "F0").trim(); // ex.: F1 (calibrado)

  return [
    DARKNESS, // ~SD11 — darkness setado pelo sistema (não depende da config salva na impressora)
    "^XA",
    PRINT_SPEED, // ^PRB — 3 ips — bordas mais nítidas
    "^MMF", // modo RFID
    PRINT_WIDTH, // ^PW576 — enquadramento horizontal (único lever que funciona nessa firmware)
    LABEL_LENGTH, // ^LL568
    "^LH0,0",
    "^LS0",
    "^CI28", // UTF-8
    `^RS8,${pos},,3,N`, // posição de programação calibrada (ex.: F1)

    // --- FRENTE (lobo de cima): SKU (OCR-B) + nome (fonte D) + EPC ---
    `^FO34,56^AEN,30,17^FD${sku}^FS`,
    `^FO34,88^ADN,18,10^FB196,2,0,L,0^FD${nome}^FS`,
    `^FO34,142^A0N,12,12^FDEPC ${epcFmt}^FS`,

    // --- VERSO (lobo de baixo, 180°): Alisson + logo do leão (já girado) ---
    "^FO86,190^ADI,20,11^FDAlisson^FS",
    `^FO98,212${LOGO_LEAO_GFA}^FS`,

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
 */
export function gerarZplJoiaDoModelo(
  dados: DadosEtiqueta,
  epc: Epc,
  modelo: EtiquetaModelo | null,
): string {
  const layout: LayoutEtiqueta = {
    larguraDots: mmToDots(modelo?.largura_mm ?? 25),
    alturaDots: mmToDots(modelo?.altura_mm ?? 35),
    offsetXDots: mmToDots(modelo?.offset_x_mm ?? 0),
    offsetYDots: mmToDots(modelo?.offset_y_mm ?? 0),
    posicaoRfid: modelo?.posicao_rfid ?? "F0",
  };
  return gerarZplEtiquetaJoia(dados, epc, layout);
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
