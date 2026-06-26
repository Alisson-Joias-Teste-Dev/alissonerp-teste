/**
 * Utilitarios para gravacao de nomes/datas em aliancas.
 *
 * Bordas Elevadas permite varios nomes inclusos (nome principal + adicionais).
 * Internamente os nomes sao serializados como uma unica string para caber na
 * coluna `texto VARCHAR` legada do orcamento_fichas_tecnicas, mas idealmente
 * a camada de ficha tecnica da fabrica (`fichas_tecnicas.dados`) armazena
 * como array — mais limpo, sem caracteres de controle, e o display fica trivial.
 *
 * Esta lib eh a UNICA fonte de verdade para parse/serialize/render de gravacao.
 * Nao reimplemente split de U+001F em outros arquivos — use estas funcoes.
 */

// Separador (Unit Separator, U+001F) — caractere de controle nao-tipavel pelo
// usuario. Usado quando precisamos serializar como string (coluna `texto`).
//
// IMPORTANTE: aceita SO U+001F. Uma versao anterior aceitava " | " tambem
// como separador legado, mas isso quebrava nomes legitimos contendo " | "
// (ex: usuario digita "Maria | Joao" como nome unico). Orcamentos antigos
// com " | " ficam como nome unico — usuario edita depois pra separar nos
// campos de adicional.
export const GRAVACAO_SEPARATOR = "\u001F";
const SPLIT_REGEX = /\u001F/;

/** Junta nome principal + adicionais numa unica string serializavel.
 *  Retorna null se nao ha nada pra gravar (todos vazios). */
export function joinGravacao(principal: string, extras: readonly string[]): string | null {
  const principalLimpo = (principal ?? "").trim();
  const extrasLimpos = (extras ?? []).map(t => (t ?? "").trim()).filter(Boolean);
  const todos = [principalLimpo, ...extrasLimpos].filter(Boolean);
  if (todos.length === 0) return null;
  return todos.join(GRAVACAO_SEPARATOR);
}

/** Quebra texto serializado em array de nomes. Aceita string, array (ja
 *  parseado, retorna como-eh) ou null/undefined (retorna []). */
export function splitGravacao(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value.split(SPLIT_REGEX).map(t => t.trim()).filter(Boolean);
}

/** Primeiro nome (principal). Util pro 3D que so renderiza um. */
export function nomePrincipal(value: unknown): string {
  return splitGravacao(value)[0] ?? "";
}

/** Nomes adicionais (todos exceto o principal). */
export function nomesAdicionais(value: unknown): string[] {
  return splitGravacao(value).slice(1);
}

/** Formata pra exibicao numa unica linha (ficha tecnica, preview).
 *  - 0 nomes: ""
 *  - 1 nome: '"Maria"'
 *  - 2+: '1) "Maria"   2) "Joao"' */
export function formatGravacao(value: unknown): string {
  const partes = splitGravacao(value);
  if (partes.length === 0) return "";
  if (partes.length === 1) return `"${partes[0]}"`;
  return partes.map((t, i) => `${i + 1}) "${t}"`).join("   ");
}
