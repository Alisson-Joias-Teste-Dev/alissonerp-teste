/**
 * Helpers para o modulo de promocoes:
 *  - expandirProdutoPai: se produto eh pai (erp_produtos.eh_pai=true), retorna
 *    todas as variacoes filhas com o MESMO pct de desconto aplicado ao pai.
 *  - checarConflito: verifica se algum dos produtos ja esta em outra promo
 *    com situacao_manual='agendada' e sobreposicao de janela.
 */
import type postgres from "postgres";

export interface ItemPromoEntrada {
  produto_id: number;
  preco_promo: number;
}

export interface ItemPromoExpandido {
  produto_id: number;
  preco_original: number; // snapshot do preco_tiny atual
  preco_promo: number;
}

export interface ConflitoPromo {
  produto_id: number;
  sku: string | null;
  nome: string | null;
  promocao_id: number;
  nome_campanha: string;
  data_inicio: string;
  data_fim: string;
}

/**
 * Recebe itens crus (id + preco_promo) e expande:
 *  - se produto eh pai com variacoes, aplica o mesmo PCT de desconto do pai
 *    em todas as filhas, calculando preco_promo_filha = preco_tiny_filha * (1 - pct).
 *  - se produto eh simples, mantem.
 *  - sempre adiciona preco_original (snapshot do preco_tiny do produto).
 *
 * Pais com preco_tiny=0 (sem preco cadastrado) sao IGNORADOS porque nao da
 * pra calcular pct. A funcao retorna apenas os filhos nesse caso.
 *
 * Lanca Error com message detalhada se um produto nao for encontrado em public.produtos.
 */
export async function expandirItensComPais(
  tx: postgres.Sql,
  itens: ItemPromoEntrada[],
): Promise<ItemPromoExpandido[]> {
  if (itens.length === 0) return [];

  const ids = itens.map(i => i.produto_id);
  // REGRA DE NEGÓCIO (16/06/2026 — Jonathan): a base ("preço original") da promoção é o
  // PREÇO DE VENDA real (curva, vw_produtos_geral_preco.preco_venda) — a MESMA fonte do
  // preço mostrado na lista de produtos e usada no POS. NÃO usar preco_tiny (campo legado
  // do Tiny, divergente: ex. AJ4715 tiny=3268,75 vs venda=4780). Snapshot = preço de venda
  // no momento de criar a campanha. Ver docs/regras-negocio/promocoes.md.
  const precosBase = await tx<{ id_produto: number; preco_base: string | null; eh_pai: boolean | null; erp_id: number | null }[]>`
    SELECT
      p.id_produto,
      vg.preco_venda AS preco_base,
      ep.eh_pai,
      ep.id AS erp_id
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    LEFT JOIN alissonerp.vw_produtos_geral_preco vg ON vg.id_produto = p.id_produto
    WHERE p.id_produto = ANY(${ids})
  `;

  const baseMap = new Map(precosBase.map(r => [Number(r.id_produto), r]));
  const resultado: ItemPromoExpandido[] = [];
  const produtosPaisExpandir: { paiId: number; pct: number }[] = [];

  for (const item of itens) {
    const base = baseMap.get(item.produto_id);
    if (!base) {
      throw new Error(`Produto id=${item.produto_id} nao encontrado em public.produtos`);
    }
    const precoLista = parseFloat(base.preco_base ?? "0");

    if (base.eh_pai === true) {
      if (precoLista <= 0) {
        // Pai sem preco cadastrado - nao da pra calcular pct, mas pode-se aplicar
        // o preco_promo absoluto em todas as filhas (interpretacao alternativa).
        // Conservador: lanca erro pra UI mostrar.
        throw new Error(
          `Produto pai id=${item.produto_id} nao tem preco_tiny > 0; impossivel calcular pct para variacoes`,
        );
      }
      const pct = (precoLista - item.preco_promo) / precoLista; // 0..1
      produtosPaisExpandir.push({ paiId: item.produto_id, pct });
    } else {
      resultado.push({
        produto_id: item.produto_id,
        preco_original: precoLista,
        preco_promo: item.preco_promo,
      });
    }
  }

  if (produtosPaisExpandir.length > 0) {
    const paiIds = produtosPaisExpandir.map(x => x.paiId);
    const filhos = await tx<{ produto_id: number; preco_base: string | null; pai_produto_id: number }[]>`
      SELECT
        filho_ep.produto_id,
        vgf.preco_venda AS preco_base,
        pai_ep.produto_id AS pai_produto_id
      FROM alissonerp.erp_produtos pai_ep
      INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
      INNER JOIN public.produtos p ON p.id_produto = filho_ep.produto_id
      LEFT JOIN alissonerp.vw_produtos_geral_preco vgf ON vgf.id_produto = filho_ep.produto_id
      WHERE pai_ep.produto_id = ANY(${paiIds})
        AND p.situacao = 'A'
    `;

    for (const filho of filhos) {
      const pai = produtosPaisExpandir.find(x => x.paiId === Number(filho.pai_produto_id));
      if (!pai) continue;
      const precoListaFilho = parseFloat(filho.preco_base ?? "0");
      if (precoListaFilho <= 0) continue; // Filho sem preco -> pula
      const precoPromoFilho = Math.round(precoListaFilho * (1 - pai.pct) * 100) / 100;
      resultado.push({
        produto_id: Number(filho.produto_id),
        preco_original: precoListaFilho,
        preco_promo: Math.max(0, precoPromoFilho),
      });
    }
  }

  return resultado;
}

/**
 * Verifica se algum produto_id da lista ja esta em outra promo com situacao
 * 'agendada' e janela que sobrepoe [dataInicio, dataFim].
 *
 * Se excluirPromocaoId for passado, ignora essa promocao (usado em PATCH).
 *
 * Retorna lista de conflitos (vazio = sem conflito).
 */
export async function checarConflitoPromocoes(
  tx: postgres.Sql,
  produtoIds: number[],
  dataInicio: string,
  dataFim: string,
  excluirPromocaoId?: number,
): Promise<ConflitoPromo[]> {
  if (produtoIds.length === 0) return [];

  const conflitos = await tx<ConflitoPromo[]>`
    SELECT
      pi.produto_id,
      p.sku,
      p.nome,
      pp.id AS promocao_id,
      pp.nome_campanha,
      pp.data_inicio,
      pp.data_fim
    FROM alissonerp.promocao_itens pi
    JOIN alissonerp.promocoes_produtos pp ON pp.id = pi.promocao_id
    LEFT JOIN public.produtos p ON p.id_produto = pi.produto_id
    WHERE pi.produto_id = ANY(${produtoIds})
      AND pp.situacao_manual = 'agendada'
      AND pp.data_inicio <= ${dataFim}::date
      AND pp.data_fim   >= ${dataInicio}::date
      ${excluirPromocaoId != null ? tx`AND pp.id <> ${excluirPromocaoId}` : tx``}
  `;

  return conflitos.map(c => ({
    ...c,
    produto_id: Number(c.produto_id),
    promocao_id: Number(c.promocao_id),
  }));
}
