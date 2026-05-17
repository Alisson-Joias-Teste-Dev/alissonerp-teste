/**
 * Guards de tamanho de payload para rotas de API.
 *
 * Endpoints que aceitam texto longo, arrays grandes ou uploads base64 sem
 * limite podem ser explorados pra explodir DB/memoria. Esses helpers fazem a
 * checagem antes do INSERT/UPDATE/upload e lancam `PayloadTooLargeError`
 * (HTTP 413) quando o tamanho ultrapassa o limite canonico.
 *
 * Padrao de uso na rota:
 *
 *   try {
 *     checkStringLength("observacoes", body.observacoes, LIMITS.OBSERVACOES_MAX);
 *     checkArrayLength("itens", body.itens, LIMITS.ITENS_VENDA_MAX);
 *   } catch (e) {
 *     const r = payloadTooLargeResponse(e);
 *     if (r) return r;
 *     throw e;
 *   }
 *
 * Os checks IGNORAM valores que nao sao do tipo esperado (string/array) — o
 * objetivo aqui eh nao deixar o atacante mandar 100MB num campo livre, nao
 * validar tipo (isso eh trabalho do Zod ou da validacao manual da rota).
 */
import { NextResponse } from "next/server";

export class PayloadTooLargeError extends Error {
  status = 413;
  field: string;
  max: number;
  actual: number;
  constructor(field: string, max: number, actual: number) {
    super(`Campo "${field}" excede limite (${actual} > ${max})`);
    this.name = "PayloadTooLargeError";
    this.field = field;
    this.max = max;
    this.actual = actual;
  }
}

/**
 * Converte um erro capturado em NextResponse 413 se for PayloadTooLargeError.
 * Devolve null se nao for — o handler deve re-lancar nesse caso.
 */
export function payloadTooLargeResponse(e: unknown): NextResponse | null {
  if (e instanceof PayloadTooLargeError) {
    return NextResponse.json({ error: e.message }, { status: 413 });
  }
  return null;
}

/**
 * Limites canonicos em bytes/chars/itens. Centralizado para que toda rota use
 * os mesmos valores e o ajuste seja feito num lugar so.
 *
 * Texto: chars (string.length). Postgres armazena UTF-8 — 1 char ASCII = 1 byte,
 * char acentuado = 2 bytes. Os limites sao folgados pra cobrir nomes complexos
 * mas evitam 100MB de spam.
 *
 * Base64: chars. Tamanho real do binario ~= length * 0.75 (4 chars = 3 bytes).
 *
 * Arrays: numero de itens.
 */
export const LIMITS = {
  // Texto
  OBSERVACOES_MAX: 5_000,         // ~5KB texto livre
  MENSAGEM_MAX: 2_000,            // ~2KB mensagem curta (comunicacao crediario, etc)
  NOME_MAX: 200,                  // 200 chars (nome produto, fornecedor, etc)
  TITULO_MAX: 500,                // 500 chars (titulo tarefa, etc)
  DESCRICAO_LONGA_MAX: 10_000,    // ~10KB descricao detalhada
  CHAT_MESSAGE_MAX: 4_000,        // ~4KB prompt LLM

  // Arquivos base64 (chars)
  IMAGE_BASE64_MAX: 5_000_000,    // ~3.75MB binario
  VIDEO_BASE64_MAX: 50_000_000,   // ~37.5MB binario
  PDF_BASE64_MAX: 10_000_000,     // ~7.5MB binario
  OFX_FILE_MAX: 1_000_000,        // 1MB (parser OFX nao faz uploads grandes)

  // Arrays (numero de itens)
  IMAGES_ARRAY_MAX: 10,           // 10 imagens por upload (editor IA usa 1-3)
  ITENS_VENDA_MAX: 100,           // 100 itens por venda (qualquer coisa acima eh spam)
  ORDENS_LOTE_MAX: 200,           // 200 ordens por lote PCP / protocolo
  MENSAGENS_CHAT_MAX: 50,         // 50 mensagens no historico de chat LLM
} as const;

/**
 * Joga 413 se o valor (quando string) tem mais de `max` chars.
 * Ignora valores que nao sao string (null, undefined, number, etc).
 */
export function checkStringLength(field: string, value: unknown, max: number): void {
  if (typeof value !== "string") return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}

/**
 * Joga 413 se o valor (quando array) tem mais de `max` itens.
 * Ignora valores que nao sao array.
 */
export function checkArrayLength(field: string, value: unknown, max: number): void {
  if (!Array.isArray(value)) return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}

/**
 * Joga 413 se a string base64 tem mais de `max` chars. Alias de
 * `checkStringLength` — existe para deixar a intencao explicita na call site
 * (base64 mede em bytes binarios, nao chars de display).
 */
export function checkBase64Length(field: string, value: unknown, max: number): void {
  if (typeof value !== "string") return;
  if (value.length > max) throw new PayloadTooLargeError(field, max, value.length);
}
