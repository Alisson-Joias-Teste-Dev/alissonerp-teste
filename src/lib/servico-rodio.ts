/**
 * REGRA DE NEGOCIO (centralizada):
 * O que: funcoes auxiliares para o servico de rodio, unificadas em um modulo
 *        para evitar duplicacao e deriva entre endpoints / frontends.
 * Por que: anteriormente as funcoes isServicoRodio, round2, normalizarTextoBusca
 *          estavam copiadas em 3 arquivos (vendas/route.ts, itens/route.ts,
 *          NovaVendaClientV2.tsx). Qualquer mudanca precisava ser sincronizada
 *          manualmente — risco de bug e inconsistencia financeira.
 * Impacto: TODOS os consumidores de baixa de rodio DEVEM importar deste modulo.
 *          Nao crie copias locais destas funcoes.
 *
 * NOTA: modulo ISOMORFICO — funciona em server (API routes) e client (React).
 *       Nao importa postgres, next/server, nem funcoes que dependam destes.
 *
 * Plano de Acao (30/05/2026) — AGENTS.md referencia:
 *   Frente B: centralizacao de helpers.
 *   Frente C: percentual configuravel via pct_calculo_servico no produto.
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

/** SKU canonico do servico de rodio no ERP. */
export const SKU_RODIO_CANONICO = "srv-rodio";

/**
 * Percentual padrao aplicado sobre o preco da joia base.
 * Usado como FALLBACK quando o produto nao tem pct_calculo_servico configurado
 * ou quando a leitura da config falha.
 */
export const PCT_RODIO_DEFAULT = 0.3;

// ─── Helpers puros (sem dependencias externas) ─────────────────────────────────

/** Arredonda numero para 2 casas decimais (precisao financeira). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normaliza texto removendo acentos e convertendo para minusculo.
 * Usado como pre-processamento para comparacoes insensiveis a acentuacao.
 */
export function normalizarTextoBusca(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ─── Tipos minimos (evita acoplamento com interfaces especificas de cada consumer) ──

/** Forma minima para isServicoRodioProduto — compatível com NovaVendaClientV2.Produto e VendaDetalheClient.Produto. */
export interface ProdutoMinimo {
  sku?: string | null;
  nome: string;
}

/** Forma minima para isServicoRodio — server-side, parametros diretos. */
export function isServicoRodio(
  sku: string | null | undefined,
  nome: string | null | undefined,
): boolean {
  const skuNorm = normalizarTextoBusca(sku);
  const nomeNorm = normalizarTextoBusca(nome);
  return (
    skuNorm === SKU_RODIO_CANONICO ||
    skuNorm.includes("rodio") ||
    skuNorm.includes("rhodio") ||
    nomeNorm.includes("rodio") ||
    nomeNorm.includes("rhodio")
  );
}

/**
 * Versao client-side — recebe objeto Produto (com sku + nome).
 * Usada em NovaVendaClientV2 e VendaDetalheClient.
 */
export function isServicoRodioProduto(produto: ProdutoMinimo | null): boolean {
  if (!produto) return false;
  return isServicoRodio(produto.sku ?? null, produto.nome);
}

// ─── Descricao de item com base SKU (renderizacao na listagem) ─────────────────

/** Forma minima para item de venda — usado em descricaoItemComBaseRodio. */
export interface ItemVendaMinimo {
  nome_produto: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalizacao?: { valor?: string; campos?: any[] } | null;
}

/**
 * REGRA DE NEGOCIO:
 * O que: exibe no nome do item de rodio o SKU base informado pela consultora.
 * Por que: a equipe precisa visualizar imediatamente qual joia sera rodinada,
 * sem depender de abrir detalhes/observacao do item.
 * Impacto: remover essa composicao reduz rastreabilidade operacional e aumenta
 * risco de executar servico no SKU errado.
 */
export function descricaoItemComBaseRodio(item: ItemVendaMinimo): string {
  const skuBase =
    item.personalizacao && "valor" in item.personalizacao
      ? (item.personalizacao.valor ?? "").trim().toUpperCase()
      : "";
  if (!skuBase) return item.nome_produto;
  const nomeNorm = normalizarTextoBusca(item.nome_produto);
  const ehRodio = nomeNorm.includes("rodio") || nomeNorm.includes("rhodio");
  if (!ehRodio) return item.nome_produto;
  return `${item.nome_produto} - Base: ${skuBase}`;
}

// ─── Percentual configuravel por produto ───────────────────────────────────────

/** Produto que PODE ter percentual de calculo de servico configurado. */
export interface ProdutoComPctServico {
  pct_calculo_servico?: number | string | null;
}

/**
 * Obtem o percentual configurado para servico de rodio no produto.
 * Prioridade:
 *   1. pct_calculo_servico do produto (se > 0 e finito)
 *   2. PCT_RODIO_DEFAULT (0.30)
 *
 * Aceita string porque a API do banco pode retornar numeric como string.
 */
export function getPctRodio(produto?: ProdutoComPctServico | null): number {
  const raw = produto?.pct_calculo_servico;
  if (raw != null) {
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
  }
  return PCT_RODIO_DEFAULT;
}

// ─── Preview client-side ───────────────────────────────────────────────────────

/**
 * Calcula preview do valor do rodio para um SKU base, usando a API de busca
 * de produtos. Retorna null se o SKU nao for encontrado ou nao tiver preco.
 *
 * O parametro pct e opcional — se nao informado, usa PCT_RODIO_DEFAULT.
 * No fluxo normal, o frontend deve extrair pct_calculo_servico do produto
 * selecionado e passar aqui.
 */
export async function calcularPreviewRodioPorSkuBase(
  skuBase: string,
  pct?: number,
): Promise<number | null> {
  const sku = skuBase.trim();
  if (!sku) return null;
  const efetivo = pct != null && Number.isFinite(pct) && pct > 0 ? pct : PCT_RODIO_DEFAULT;
  const res = await fetch(
    `/api/vendas/produtos/busca?q=${encodeURIComponent(sku)}&limit=20`,
  );
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = (await res.json()) as any[];
  const exato = lista.find((p) => (p.sku ?? "").toLowerCase() === sku.toLowerCase());
  if (
    !exato ||
    exato.preco_venda == null ||
    Number(exato.preco_venda) <= 0
  ) {
    return null;
  }
  return round2(Number(exato.preco_venda) * efetivo);
}
