/**
 * Comissão do ITEM — calculada NO SERVIDOR.
 *
 * O QUÊ
 *   Resolve o preço CHEIO do item (o da campanha, quando em promoção) e deriva
 *   a comissão pela `alissonerp.faixas_comissao`. Todos os pontos que gravam
 *   item de venda passam por aqui.
 *
 * O PORQUÊ (achado em 03/08/2026 — ver docs/regras-negocio/comercial.md §2.1)
 *   Até aqui a comissão vinha PRONTA DO NAVEGADOR: as rotas gravavam
 *   `${body.pct_comissao ?? 0}` sem recalcular nem conferir contra a tabela de
 *   faixas. E o preço cheio da campanha não existia no banco — vivia só como
 *   estado React. Resultado: toda venda promocional reaberta media o desconto
 *   contra o preço já promocional, enxergava 0% e pagava a faixa cheia de 4%
 *   onde a tabela mandava 0,50%. Custou R$ 575,61 só em julho/2026.
 *
 * O IMPACTO SE FOR REMOVIDO
 *   A comissão volta a ser o que o navegador mandar, e o furo da promoção
 *   reabre — silenciosamente, porque nada no banco denuncia.
 *
 * ⚠️ FRONTEIRA — o que este módulo NÃO faz:
 *
 *   1. NÃO decide aprovação. Promoção é PRÉ-APROVADA (Jonathan, 03/08/2026):
 *      item com 32,89% de promoção vende sem aprovação nenhuma. O portão de
 *      alçada continua olhando `pct_desconto` (desconto sobre o preço já
 *      promocional). São dois descontos diferentes e não podem se misturar —
 *      usar o preço cheio na alçada faria toda venda promocional pedir
 *      aprovação.
 *
 *   2. NÃO encosta em item SEM `produto_id`. Aliança e peça personalizada nunca
 *      têm produto_id (117 itens desde 01/05/2026, todos desses dois tipos) e a
 *      comissão deles vem do módulo de orçamento, que calcula pelo PESO. Decisão
 *      do Jonathan em 03/08/2026: "não é bug, é do módulo de orçamento de
 *      alianças, ele vê o peso".
 *
 *   3. NÃO recalcula venda que saiu do rascunho. O que congela a comissão é a
 *      VENDA APROVADA (Jonathan, 03/08/2026). Enquanto está em rascunho tudo
 *      pode mudar e recalcula; aprovou, fica como está.
 */

import sql from "@/lib/db";
import { comissaoDaFaixa, arredondarMoeda, type FaixaComissao } from "@/lib/desconto/precificar-item";

/** Situação da venda em que o item ainda recalcula. Ver ⚠️ 3 no topo. */
export const SITUACAO_VENDA_RECALCULA_COMISSAO = "rascunho";

export interface ComissaoItemCalculada {
  /** Preço cheio resolvido — o que vai para `itens_venda_erp.preco_lista_cheio`. */
  preco_lista_cheio: number;
  /** Desconto REAL do item em %, medido contra o preço cheio. Só para comissão. */
  desconto_real: number;
  pct_comissao: number;
  valor_comissao: number;
}

/**
 * Preço cheio do item.
 *
 * Produto em promoção vigente → `preco_promo_original` da campanha (o snapshot
 * que a campanha fixou). Senão → o próprio `preco_lista` do item.
 *
 * Usa `alissonerp.vw_produto_preco_vigente`, a MESMA view que a busca de
 * produtos do PDV usa. É de propósito: o preço cheio gravado tem que ser o que
 * a vendedora viu na tela na hora de vender. A view já resolve campanha
 * sobreposta com `ORDER BY data_inicio DESC, id DESC LIMIT 1` — nunca fazer
 * JOIN direto em `promocao_itens`, que multiplicaria a linha.
 */
export async function resolverPrecoCheio(
  produtoId: number | null | undefined,
  precoLista: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<number> {
  const lista = Number(precoLista) || 0;
  if (!produtoId) return lista;

  const runner = txClient ?? sql;
  const [row] = await runner`
    SELECT preco_promo_original
    FROM alissonerp.vw_produto_preco_vigente
    WHERE id_produto = ${produtoId}
      AND em_promocao IS TRUE
      AND preco_promo_original IS NOT NULL
  `;

  const cheio = row?.preco_promo_original != null ? Number(row.preco_promo_original) : 0;
  // GREATEST na prática: campanha com preço original abaixo do preço gravado
  // daria desconto negativo e faixa errada.
  return cheio > lista ? cheio : lista;
}

/** Faixas ativas, na ordem que `comissaoDaFaixa` espera. */
export async function buscarFaixasComissao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<FaixaComissao[]> {
  const runner = txClient ?? sql;
  const rows = await runner`
    SELECT desconto_pct, comissao_pct
    FROM alissonerp.faixas_comissao
    WHERE ativo IS TRUE
    ORDER BY desconto_pct
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    desconto_pct: Number(r.desconto_pct),
    comissao_pct: Number(r.comissao_pct),
  }));
}

/**
 * Comissão do item a partir do preço cheio já resolvido — função pura.
 *
 * O desconto é derivado dos PREÇOS, nunca do `pct_desconto` gravado: é ele que
 * mente no item promocional (mede contra o preço já promocional) e no item cujo
 * preço foi digitado à mão. Desconto negativo (vendido acima da lista) vira 0.
 */
export function calcularComissaoItem(
  precoCheio: number,
  precoUnitario: number,
  totalItem: number,
  faixas: FaixaComissao[],
): ComissaoItemCalculada {
  const cheio = Number(precoCheio) || 0;
  const unit = Number(precoUnitario) || 0;
  const total = Number(totalItem) || 0;

  const desconto = cheio > 0
    ? Math.max(0, arredondarMoeda(((cheio - unit) / cheio) * 100))
    : 0;
  const pct = comissaoDaFaixa(desconto, faixas);

  return {
    preco_lista_cheio: cheio,
    desconto_real: desconto,
    pct_comissao: pct,
    valor_comissao: arredondarMoeda((total * pct) / 100),
  };
}

export interface ItemResolvido {
  /** SEMPRE preenchido. É um fato do item (qual era o preço cheio na hora da
   *  venda), não um recálculo — por isso é gravado mesmo quando a comissão não
   *  se mexe. Sem isso, item criado fora do rascunho nasceria com a coluna nula
   *  e a auditoria não teria contra o que medir. */
  preco_lista_cheio: number;
  /** `null` = NÃO mexer na comissão; grave o que o chamador mandou.
   *  Acontece em dois casos, ambos deliberados (ver fronteira no topo):
   *   • item sem `produto_id` → aliança/personalizada, regra do orçamento (peso)
   *   • venda fora do rascunho → aprovada congela a comissão */
  comissao: { pct_comissao: number; valor_comissao: number; desconto_real: number } | null;
}

/**
 * O que as rotas chamam: resolve o preço cheio (sempre) e a comissão (quando
 * pode). Ver a fronteira no topo do arquivo.
 */
export async function resolverItemComissao(args: {
  produtoId: number | null | undefined;
  precoLista: number;
  precoUnitario: number;
  totalItem: number;
  situacaoVenda: string | null | undefined;
  faixas?: FaixaComissao[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any;
}): Promise<ItemResolvido> {
  const { produtoId, precoLista, precoUnitario, totalItem, situacaoVenda, txClient } = args;

  const cheio = await resolverPrecoCheio(produtoId, precoLista, txClient);

  if (!produtoId || situacaoVenda !== SITUACAO_VENDA_RECALCULA_COMISSAO) {
    return { preco_lista_cheio: cheio, comissao: null };
  }

  const faixas = args.faixas ?? await buscarFaixasComissao(txClient);
  const calc = calcularComissaoItem(cheio, precoUnitario, totalItem, faixas);
  return {
    preco_lista_cheio: calc.preco_lista_cheio,
    comissao: {
      pct_comissao: calc.pct_comissao,
      valor_comissao: calc.valor_comissao,
      desconto_real: calc.desconto_real,
    },
  };
}
