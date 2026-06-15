// ═══════════════════════════════════════════════════════════════════════════
// Dias úteis — cálculo do prazo de devolução (7 dias úteis)
//
// REGRA DE NEGÓCIO:
//   O QUE: conta dias úteis entre duas datas, excluindo sábado, domingo e
//     FERIADOS (nacionais + estaduais do Ceará + municipais de Fortaleza).
//   POR QUE: a devolução só pode ser criada normalmente até 7 dias úteis após a
//     ENTREGA REAL ao cliente (dia em que deu o código). Passado o prazo, precisa
//     de aprovação configurável.
//   IMPACTO SE ALTERADO: muda o prazo efetivo de devolução — libera ou bloqueia
//     indevidamente a geração de vale-troca.
//
// Decisão Jonathan (15/06/2026): "se for feriado, entra" — inclui os móveis
// observados (Carnaval terça, Corpus Christi) além de Sexta-feira Santa.
// ═══════════════════════════════════════════════════════════════════════════

/** Domingo de Páscoa (algoritmo de Meeus/Butcher) — base dos feriados móveis. */
function domingoPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const cacheFeriados = new Map<number, Set<string>>();

/**
 * Conjunto de feriados (chave 'YYYY-MM-DD') observados em Fortaleza/CE em um ano:
 * nacionais (fixos + móveis), estadual do Ceará e municipais de Fortaleza.
 */
export function feriadosFortaleza(ano: number): Set<string> {
  const cached = cacheFeriados.get(ano);
  if (cached) return cached;

  // [mes, dia] — fixos
  const fixos: ReadonlyArray<readonly [number, number]> = [
    [1, 1],   // Confraternização Universal (nacional)
    [3, 19],  // São José, padroeiro do Ceará (observado em Fortaleza)
    [3, 25],  // Data Magna do Ceará — abolição da escravidão no CE (estadual)
    [4, 13],  // Aniversário de Fortaleza (municipal)
    [4, 21],  // Tiradentes (nacional)
    [5, 1],   // Dia do Trabalho (nacional)
    [8, 15],  // N. Sra. da Assunção, padroeira de Fortaleza (municipal)
    [9, 7],   // Independência (nacional)
    [10, 12], // N. Sra. Aparecida (nacional)
    [11, 2],  // Finados (nacional)
    [11, 15], // Proclamação da República (nacional)
    [11, 20], // Consciência Negra (nacional desde 2024 — Lei 14.759/2023)
    [12, 8],  // N. Sra. da Conceição (municipal)
    [12, 25], // Natal (nacional)
  ];

  const set = new Set<string>();
  for (const [mes, dia] of fixos) set.add(chaveDia(new Date(ano, mes - 1, dia)));

  // Móveis (base no Domingo de Páscoa)
  const pascoa = domingoPascoa(ano);
  set.add(chaveDia(addDias(pascoa, -2)));  // Sexta-feira Santa
  set.add(chaveDia(addDias(pascoa, -47))); // Carnaval (terça)
  set.add(chaveDia(addDias(pascoa, 60)));  // Corpus Christi

  cacheFeriados.set(ano, set);
  return set;
}

/** Verdadeiro se a data NÃO é sábado, domingo nem feriado (Fortaleza/CE). */
export function ehDiaUtil(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false; // domingo / sábado
  return !feriadosFortaleza(d.getFullYear()).has(chaveDia(d));
}

/**
 * Conta dias úteis DECORRIDOS de `de` (exclusive — o dia da entrega é o dia 0 e
 * NÃO conta) até `ate` (inclusive). Lida com intervalo que cruza o ano.
 */
export function diasUteisDecorridos(de: Date, ate: Date): number {
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  const cur = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  cur.setDate(cur.getDate() + 1); // pula o próprio dia da entrega (dia 0)
  let count = 0;
  while (cur <= fim) {
    if (ehDiaUtil(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Prazo padrão de devolução, em dias úteis. */
export const PRAZO_DEVOLUCAO_DIAS_UTEIS = 7;
