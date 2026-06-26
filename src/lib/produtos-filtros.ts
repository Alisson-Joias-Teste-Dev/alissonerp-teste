/**
 * Predicados WHERE compartilhados entre /api/produtos, /metais e /categorias.
 * Garante que os contadores dos selects reflitam os filtros já ativos.
 *
 * Cada helper retorna um fragmento SQL (postgres.js) pronto para compor.
 */
import sql from "@/lib/db";

type Sp = URLSearchParams;

export type FiltroKind =
  | "busca" | "sku_prefix" | "tem_pedra" | "situacao" | "categoria"
  | "subcategoria" | "tipo_metal" | "apenas_com_estoque" | "esconder_insumos"
  | "pendencia" | "tipo_item" | "com_variacoes";

/** Conjunto de predicados. Por default inclui todos; excluir os que são o "foco" da contagem. */
export interface FiltrosOpts {
  exclude?: FiltroKind[];
}

function has(opts: FiltrosOpts | undefined, k: FiltroKind): boolean {
  return !(opts?.exclude ?? []).includes(k);
}

export function buildFiltrosProdutos(sp: Sp, opts: FiltrosOpts = {}) {
  const busca        = sp.get("busca")?.trim() ?? "";
  const skuPrefix    = sp.get("sku_prefix")?.trim() ?? "";
  const tem_pedra    = sp.get("tem_pedra");
  const situacao     = sp.get("situacao") ?? "A";
  const categoria    = sp.get("categoria")?.trim() ?? "";
  const subcategoria = sp.get("subcategoria")?.trim() ?? "";
  const tipo_metal   = sp.get("tipo_metal")?.trim() ?? "";
  const apenasComEstoque = sp.get("apenas_com_estoque") === "true";
  const esconderInsumos  = sp.get("esconder_insumos") === "true";
  const pendencia    = sp.get("pendencia")?.trim() ?? "";
  const tipoItem     = sp.get("tipo_item")?.trim() ?? "";
  const comVariacoes = sp.get("com_variacoes")?.trim() ?? "";

  const wBusca = has(opts, "busca") && busca
    ? sql`AND (p.nome ILIKE ${"%" + busca + "%"} OR p.sku ILIKE ${"%" + busca + "%"})`
    : sql``;

  const wSkuPrefix = has(opts, "sku_prefix") && skuPrefix
    ? sql`AND p.sku ILIKE ${skuPrefix + "%"}`
    : sql``;

  const wPedra = has(opts, "tem_pedra") && (
    tem_pedra === "true"  ? sql`AND p.tem_pedra_preciosa = true`  :
    tem_pedra === "false" ? sql`AND p.tem_pedra_preciosa = false` :
    sql``
  );

  const wSituacao = has(opts, "situacao") && situacao
    ? sql`AND p.situacao = ${situacao}`
    : sql``;

  const wCategoria = has(opts, "categoria") && categoria
    ? subcategoria
      ? sql`AND TRIM(p.categoria) = ${`${categoria} -> ${subcategoria}`}`
      : sql`AND (TRIM(p.categoria) = ${categoria} OR TRIM(p.categoria) ILIKE ${`${categoria} -> %`})`
    : sql``;

  const wTipoMetal = has(opts, "tipo_metal") && (
    tipo_metal === "__sem__" ? sql`AND (p.tipo_metal IS NULL OR TRIM(p.tipo_metal) = '')` :
    tipo_metal                ? sql`AND p.tipo_metal = ${tipo_metal}` :
    sql``
  );

  // Saldo pode vir de 3 fontes (centralizado no schema alissonerp):
  //   1. alissonerp.movimentacoes_estoque_comercial (estoque comercial, por produto_id)
  //   2. alissonerp.vw_estoque_directus_saldo (insumos/pedras do Directus legado)
  //   3. FILHOS: se o produto é pai (eh_pai=true ou simples com filhos em erp_produtos),
  //      considera com estoque se QUALQUER variação dele tem saldo >= 1.
  const wEstoque = has(opts, "apenas_com_estoque") && apenasComEstoque
    ? sql`AND (
        COALESCE((
          SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)
          FROM alissonerp.movimentacoes_estoque_comercial m
          WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'
        ), 0) >= 1
        OR EXISTS (SELECT 1 FROM alissonerp.vw_estoque_directus_saldo v
                   WHERE v.insumo_sku = p.sku AND v.saldo >= 1)
        OR (
          SELECT COALESCE(SUM(CASE WHEN m2.tipo = 'entrada' THEN m2.quantidade ELSE -m2.quantidade END), 0)
          FROM alissonerp.erp_produtos pai_ep
          INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
          INNER JOIN alissonerp.movimentacoes_estoque_comercial m2 ON m2.produto_id = filho_ep.produto_id
          WHERE pai_ep.produto_id = p.id_produto AND m2.status = 'efetivado'
        ) >= 1
      )`
    : sql``;

  // "Esconder insumos" também cobre mostruário e matérias-primas (itens de
  // suporte/exposição que não são joias do acervo comercial).
  const wEsconderInsumos = has(opts, "esconder_insumos") && esconderInsumos
    ? sql`AND (p.sku IS NULL OR p.sku NOT ILIKE 'IS%')
          AND (p.sku IS NULL OR p.sku NOT ILIKE 'MO%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Insumos%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Matérias Primas%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruário%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruario%')`
    : sql``;

  // Pedras são itens comercializados em R$/unidade sem lastro em metal —
  // não devem aparecer em "sem metal", "sem peso" nem "sem preço" (seu preço
  // vem de preco_tiny, e peso é cosmético — ct×0.2 muito pequeno).
  const wNaoPedra = sql`(p.categoria IS NULL OR p.categoria NOT ILIKE 'Pedras%')`;

  // Produtos com personalização ativa (SKUs PZxxxx sob encomenda) têm peso/preço
  // calculados dinamicamente por letra — não devem aparecer em "sem peso" nem
  // "sem preço". Config em alissonerp.produto_personalizacao (migration 162+).
  const wNaoPersonalizado = sql`NOT EXISTS (
    SELECT 1 FROM alissonerp.produto_personalizacao pp
    WHERE pp.produto_id = p.id_produto
      AND pp.ativo = true
  )`;

  const wSemCat   = sql`(p.categoria IS NULL OR TRIM(p.categoria) = '')`;
  const wSemMetal = sql`(p.tipo_metal IS NULL OR TRIM(p.tipo_metal) = '') AND ${wNaoPedra}`;
  const wSemPeso  = sql`(p.peso_precificado IS NULL OR p.peso_precificado = 0)
                    AND ${wNaoPedra}
                    AND ${wNaoPersonalizado}`;
  // "Sem preço" = TODOS os preços nulos ou zero (comparação numérica).
  // Antes comparava ::text = '0' que falhava para "0.00" gravado como string.
  const wSemPreco = sql`COALESCE(p.preco_sync::numeric,       0) = 0
                    AND COALESCE(p.preco_total_sync::numeric, 0) = 0
                    AND COALESCE(p.preco_tiny::numeric,       0) = 0
                    AND ${wNaoPedra}
                    AND ${wNaoPersonalizado}`;
  const wPendencia = has(opts, "pendencia") && (
    pendencia === "sem_categoria" ? sql`AND ${wSemCat}` :
    pendencia === "sem_metal"     ? sql`AND ${wSemMetal}` :
    pendencia === "sem_peso"      ? sql`AND ${wSemPeso}` :
    pendencia === "sem_preco"     ? sql`AND ${wSemPreco}` :
    pendencia === "qualquer"      ? sql`AND (${wSemCat} OR ${wSemMetal} OR ${wSemPeso} OR ${wSemPreco})` :
    sql``
  );

  const wTipoItem = has(opts, "tipo_item") && (
    tipoItem === "__sem__" ? sql`AND ti.tipo_item IS NULL` :
    tipoItem                ? sql`AND ti.tipo_item = ${tipoItem}` :
    sql``
  );

  // Filtro de produtos com/sem variacoes (usa erp_produtos.eh_pai).
  // A query principal deve fazer LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  // para este fragmento funcionar.
  const wVariacoes = has(opts, "com_variacoes") && (
    comVariacoes === "true"  ? sql`AND ep.eh_pai = true` :
    comVariacoes === "false" ? sql`AND (ep.eh_pai IS NULL OR ep.eh_pai = false)` :
    sql``
  );

  return {
    wBusca, wSkuPrefix, wPedra, wSituacao, wCategoria,
    wTipoMetal, wEstoque, wEsconderInsumos, wPendencia, wTipoItem, wVariacoes,
    // Para predicados reutilizáveis de pendência fora do filtro (ex: retorno array):
    wSemCat, wSemMetal, wSemPeso, wSemPreco,
  };
}
