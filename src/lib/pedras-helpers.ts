/**
 * Helpers compartilhados de cálculo de pedras (joalheria).
 * Reusado em PedrasComponenteSection e ProdutoDrawer (resumo de preço).
 */

import { stoneMmToCt } from "@/app/(dashboard)/orcamento/constants";

export interface PedraInfo {
  pedra_produto_id: number;
  nome: string;
  sku: string;
  preco_unitario: number;
  quantidade: number;
}

export interface PedraEnriquecida extends PedraInfo {
  tipo: string;      // "Diamante", "Moissanita", "Zirconia", "Esmeralda"...
  tamanho: number;   // mm (0 se não conseguir parsear)
  ctUnit: number;    // ct por unidade
  pontosUn: number;  // pontos por unidade (1pt = 0.01ct)
  ctTotal: number;   // ct × qtd
  pontosTotal: number;
  subtotalRS: number;
}

/**
 * Parseia tipo + tamanho a partir do nome da pedra.
 * Cobre:
 *   "Diamante Natural 1.5mm"      → { tipo: "Diamante", tamanho: 1.5 }
 *   "Moissanita 2.0mm"            → { tipo: "Moissanita", tamanho: 2.0 }
 *   "Zirconia 1.4mm"              → { tipo: "Zirconia", tamanho: 1.4 }
 *   "Esmeralda 3,6mm"             → { tipo: "Esmeralda", tamanho: 3.6 }
 *   "Lápis-lazúli 4mm"            → { tipo: "Lápis-lazúli", tamanho: 4 }
 * Se não bater no padrão, retorna { tipo: nome, tamanho: 0 }.
 */
export function parseTipoTamanho(nome: string): { tipo: string; tamanho: number } {
  const match = nome.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
  if (!match) return { tipo: nome, tamanho: 0 };
  const tamanho = parseFloat(match[1].replace(",", "."));
  const antes = nome.substring(0, match.index).trim();
  // Remove qualificadores comuns que sujam o "tipo"
  const tipo = antes.replace(/\b(Natural|Lapidação|Brilhante|De)\b/gi, "").replace(/\s+/g, " ").trim() || antes;
  return { tipo, tamanho };
}

/** Pontos por pedra: 1 ponto = 0.01 ct → mm → ct → pt */
export function pontosPorPedra(mm: number): number {
  if (mm <= 0) return 0;
  return stoneMmToCt(mm) * 100;
}

/** Enriquece uma pedra com tipo, tamanho, ct e pontos calculados */
export function enriquecerPedra(p: PedraInfo): PedraEnriquecida {
  const { tipo, tamanho } = parseTipoTamanho(p.nome);
  const ctUnit = stoneMmToCt(tamanho);
  const pontosUn = pontosPorPedra(tamanho);
  const ctTotal = ctUnit * p.quantidade;
  const pontosTotal = pontosUn * p.quantidade;
  const subtotalRS = p.preco_unitario * p.quantidade;
  return { ...p, tipo, tamanho, ctUnit, pontosUn, ctTotal, pontosTotal, subtotalRS };
}

/** Totaliza várias pedras enriquecidas (somatórios) */
export function totalizarPedras(items: PedraEnriquecida[]) {
  return items.reduce(
    (acc, p) => {
      acc.qtd += p.quantidade;
      acc.ctTotal += p.ctTotal;
      acc.pontosTotal += p.pontosTotal;
      acc.subtotalRS += p.subtotalRS;
      return acc;
    },
    { qtd: 0, ctTotal: 0, pontosTotal: 0, subtotalRS: 0 },
  );
}

/** Formata número como ct (3 casas, vírgula BR) */
export function fmtCt(v: number): string {
  return `${v.toFixed(3).replace(".", ",")} ct`;
}

/** Formata número como pontos (1 casa, vírgula BR) */
export function fmtPt(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} pt`;
}
