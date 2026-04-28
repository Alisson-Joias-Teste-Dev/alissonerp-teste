/**
 * Helper server-side para gerar ZPL II de etiquetas RFID de joias.
 *
 * Arquitetura:
 *   Backend (esta funcao) gera a string ZPL.
 *   Frontend envia ZPL ao utilitario "Zebra Browser Print" (localhost:9101)
 *   que por sua vez escreve no dispositivo USB da Zebra ZD621R.
 *
 * Formato EPC:
 *   AJ{AA}{NNNNNNNN} = 12 chars ASCII = 96 bits em hex ASCII
 *   Exemplo: "AJ2600000001" -> "414A3236303030303030303031" (24 hex chars)
 */

export interface DadosEtiquetaRfid {
  epc:   string;  // ex: AJ2600000001
  sku:   string;  // ex: 1470-6
  nome:  string;  // ex: Anel Aparador em Ouro Branco com Diamantes
}

/**
 * Sanitiza texto para ZPL:
 *   - Remove caracteres de comando ZPL (^, ~) substituindo por espaco
 *   - Remove caracteres de controle (\x00-\x1F) e DEL (\x7F)
 *   - Trim
 */
function sanitizeZpl(input: string): string {
  return input
    .replace(/\^/g, " ")
    .replace(/~/g, " ")
     
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Trunca string a N caracteres preservando palavras quando possivel.
 * Fallback para corte duro se nao houver espaco.
 */
function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}

/**
 * Converte EPC string ASCII para hex ASCII uppercase (formato de gravacao na tag).
 * 12 chars ASCII = 24 chars hex = 96 bits (padrao EPC Gen2).
 *
 * Exemplo: "AJ2600000001" -> "414A3236303030303030303031"
 */
export function epcToHex(epc: string): string {
  return Buffer.from(epc, "ascii").toString("hex").toUpperCase();
}

/**
 * Valida formato AJ{AA}{NNNNNNNN} (12 chars).
 * Retorna true se valido.
 */
export function isEpcValido(epc: string): boolean {
  return /^AJ\d{2}\d{8}$/.test(epc);
}

/**
 * Gera ZPL II para jewelry loop ~50mm x 10mm (203 dpi).
 * Layout:
 *   - Grava EPC no chip RFID via ^RFW,H (hex)
 *   - QR Code (QuickResponse) com o EPC (leitura visual de backup)
 *   - Texto: SKU em fonte maior, nome truncado em fonte menor
 */
export function gerarZplEtiquetaJoia(dados: DadosEtiquetaRfid): string {
  if (!isEpcValido(dados.epc)) {
    throw new Error(`EPC invalido: ${dados.epc} (esperado AJ{AA}{NNNNNNNN})`);
  }

  const epcHex    = epcToHex(dados.epc);
  const skuLimpo  = sanitizeZpl(dados.sku);
  const nomeLimpo = truncate(sanitizeZpl(dados.nome), 25);

  // Template com PW/LL ajustaveis conforme tamanho real da tag.
  // ^PW400 = largura 400 dots (~50mm @ 203dpi)
  // ^LL80  = altura 80 dots  (~10mm @ 203dpi)
  // ^RFW,H = RFID Write (H = Hex format)
  return (
    `^XA\n` +
    `^PW400\n` +
    `^LL80\n` +
    `^RFW,H^FD${epcHex}^FS\n` +
    `^FO10,10^BQN,2,2^FDLA,${dados.epc}^FS\n` +
    `^FO90,15^A0N,20,20^FD${skuLimpo}^FS\n` +
    `^FO90,40^A0N,15,15^FD${nomeLimpo}^FS\n` +
    `^XZ`
  );
}
