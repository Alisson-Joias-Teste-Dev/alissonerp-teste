/**
 * Extrato de comissão — leitura (migration 363)
 *
 * O QUÊ
 *   Monta as linhas do extrato de comissão no formato de conta-corrente, em
 *   BALDES (buckets): comissões do mês, débitos de devolução, outros créditos,
 *   outros débitos e pagamentos efetuados. Alimenta as duas telas:
 *     tela 1 (lista)   — uma linha por vendedora, colunas = os baldes + saldo
 *     tela 2 (detalhe) — as linhas de cada balde de uma consultora
 *
 * O PORQUÊ
 *   O saldo tem que ser a SOMA dos lançamentos, sem cálculo escondido — é isso
 *   que faz a conta bater por construção e a conferência ser possível linha a
 *   linha. Formato definido pelo Jonathan em 03/08/2026, espelhando o extrato
 *   de comissão do Tiny/Olist.
 *
 * De onde vem cada linha (as duas fontes NÃO podem se sobrepor):
 *   a) `fechamento_comissao_itens` — o que já está gravado (comissões fechadas,
 *      débitos de devolução, ajustes)
 *   b) pagamentos confirmados que ainda não entraram em nenhum item — calculados
 *      na hora e marcados `previsto`, para o mês corrente não ficar vazio até
 *      alguém gerar o fechamento. A busca exclui todo pagamento já usado em (a).
 *   c) fechamentos com status 'pago' — viram a linha de baixa
 *
 * O IMPACTO SE ALTERADO
 *   Tirar o filtro anti-sobreposição de (b) faz o mesmo real aparecer duas vezes
 *   e o saldo mentir. E "comissões pendentes" (crediário não pago) NUNCA entra no
 *   saldo — o que firma a comissão é o pagamento.
 */

import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import {
  aplicarFator, chaveResultado, competenciaDaData,
  getVendedoresSemComissao, resultadosMeta,
} from "@/lib/comissao-fator";

export type BaldeExtrato =
  | "comissao"
  | "devolucao"
  | "outro_credito"
  | "outro_debito"
  | "pagamento";

export interface LinhaExtrato {
  consultora_id: number;
  consultora_nome: string | null;
  data: string;
  balde: BaldeExtrato;
  descricao: string;
  pedido: string | null;
  venda_id: number | null;
  /** Cliente e forma SOLTOS, além de já virem dentro de `descricao`.
   *
   *  O PORQUÊ (04/08/2026): a tela agrupa as linhas por VENDA — um pedido pago
   *  em 3 parcelas vira UMA linha, e as formas aparecem dentro. Para remontar a
   *  descrição do grupo ("Cliente · pedido X · 3 pagamentos") e listar a forma
   *  de cada pagamento, o front precisa dos dois separados; extrair da string
   *  pronta quebraria no primeiro cliente com " · " no nome. */
  cliente: string | null;
  forma: string | null;
  /** Data da VENDA (não a do pagamento).
   *
   *  O PORQUÊ (Jonathan, 04/08/2026): a comissão segue o DINHEIRO, então uma
   *  venda de maio paga em julho aparece em julho — e a consultora não tem como
   *  saber disso olhando a linha. Em julho/2026 a Germana tinha 11 pedidos de
   *  outros meses no extrato (R$519,95), um deles de MARÇO DE 2025.
   *  A tela pinta a data de âmbar quando o mês da venda difere da competência. */
  data_venda: string | null;
  valor_pago: number | null;
  base_comissao: number | null;
  /** Itens da venda — o detalhe que abre ao clicar na linha. `null` quando a
   *  linha não tem venda (pagamento) ou quando o chamador pediu sem itens. */
  itens: ItemDaVenda[] | null;
  valor: number;
  previsto: boolean;
  /** Comissão CHEIA, antes do fator da meta. Igual a `valor` quando fator = 1. */
  comissao_bruta: number;
  /** Fator da meta do mês DA VENDA (1 = integral). Ver src/lib/comissao-fator.ts. */
  fator_meta: number;
  /** Por que a linha foi reduzida — vai escrito na tela. Vazio quando fator = 1. */
  motivo_fator: string;
}

export interface ItemDaVenda {
  sku: string | null;
  nome_produto: string;
  quantidade: number;
  /** Desconto REAL do item, em %: (preço cheio − preço unitário) ÷ preço cheio,
   *  usando o `promocao_itens.preco_original` da campanha vigente na data da venda
   *  quando o item está em promoção. NÃO é o `itens_venda_erp.pct_desconto`
   *  gravado — é ele que mente no item promocional: mede contra o preço já
   *  promocional, dá 0% e o sistema paga a faixa cheia. Negativo (vendido acima
   *  da lista) vira 0. */
  desconto: number;
  pct_comissao: number;
  valor_comissao: number;
}

/**
 * Itens de cada venda, com o desconto real calculado.
 *
 * O PORQUÊ (Jonathan, 03/08/2026): desconto e comissão vivem no ITEM, não na
 * venda. Em julho/2026, 66% das vendas com mais de um item tinham percentuais
 * DIFERENTES entre os itens (pedido 15803 = um item a 4,00% e outro a 0,50%).
 * Qualquer número por venda — média, faixa — ou mente ou esconde. O extrato fica
 * limpo com um valor por coluna e a verdade item a item abre no clique.
 *
 * ⚠️ O join com a promoção é `LEFT JOIN LATERAL ... MAX(preco_original)`, NÃO um
 * join direto em `promocao_itens`: um produto pode estar em DUAS campanhas
 * sobrepostas na mesma data (aconteceu com o AJ4895 em 31/07/2026) e o join
 * direto DUPLICA o item — o detalhe mostraria a mesma peça duas vezes.
 */
async function itensPorVenda(vendaIds: number[]): Promise<Map<number, ItemDaVenda[]>> {
  const mapa = new Map<number, ItemDaVenda[]>();
  if (vendaIds.length === 0) return mapa;

  const rows = await sql<Array<{
    venda_id: number; sku: string | null; nome_produto: string;
    quantidade: string; desconto: string; pct_comissao: string; valor_comissao: string;
  }>>`
    SELECT iv.venda_id, iv.sku, iv.nome_produto,
           iv.quantidade::text, d.desconto::text,
           iv.pct_comissao::text, iv.valor_comissao::text
    FROM alissonerp.itens_venda_erp iv
    JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
    LEFT JOIN LATERAL (
      SELECT MAX(pi.preco_original) AS preco_original
      FROM alissonerp.promocao_itens pi
      JOIN alissonerp.promocoes_produtos pp ON pp.id = pi.promocao_id
      WHERE pi.produto_id = iv.produto_id
        AND v.data_venda BETWEEN pp.data_inicio AND pp.data_fim
    ) pr ON true
    CROSS JOIN LATERAL (
      SELECT CASE WHEN GREATEST(COALESCE(pr.preco_original, iv.preco_lista), iv.preco_lista) > 0
                  THEN GREATEST(ROUND((
                         (GREATEST(COALESCE(pr.preco_original, iv.preco_lista), iv.preco_lista) - iv.preco_unitario)
                         / GREATEST(COALESCE(pr.preco_original, iv.preco_lista), iv.preco_lista)
                       ) * 100, 2), 0)
                  ELSE 0 END AS desconto
    ) d
    WHERE iv.venda_id = ANY(${vendaIds})
    ORDER BY iv.venda_id, iv.id
  `;

  for (const r of rows) {
    const vid = Number(r.venda_id);
    if (!mapa.has(vid)) mapa.set(vid, []);
    mapa.get(vid)!.push({
      sku: r.sku,
      nome_produto: r.nome_produto,
      quantidade: Number(r.quantidade),
      desconto: Number(r.desconto),
      pct_comissao: Number(r.pct_comissao),
      valor_comissao: Number(r.valor_comissao),
    });
  }
  return mapa;
}

/** Classifica um item gravado no balde certo do extrato. */
function baldeDoItem(tipoItem: string, devolucaoId: number | null, forma: string | null, valor: number): BaldeExtrato {
  if (devolucaoId) return "devolucao";
  if (tipoItem === "ajuste_positivo") return "outro_credito";
  if (tipoItem === "ajuste_negativo") return "outro_debito";
  if (tipoItem === "estorno") return valor < 0 ? "outro_debito" : "outro_credito";
  // REGRA (Jonathan, 05/09/2026): venda paga com vale-troca É VENDA — só foi paga
  // com outro instrumento. Ela mora em "comissões do mês", com etiqueta de vale,
  // e não mais num balde à parte. ANTES caía em "outros créditos" (espelhando o
  // Tiny), o que escondia venda de verdade num canto da tela e tirava o vale da
  // leitura do mês. IMPACTO se voltar atrás: os totais não mudam (o saldo é a
  // soma dos baldes), mas a venda em vale some da lista principal de novo.
  return "comissao";
}

export async function linhasExtrato(
  consultoraId: number | null,
  de: string,
  ate: string,
  /** Traz os itens de cada venda (o detalhe que abre na tela 2). A tela 1 só
   *  soma os baldes e joga as linhas fora — carregar item lá é consulta perdida
   *  sobre o mês INTEIRO de todas as consultoras. Por isso o padrão é false. */
  comItens = false,
): Promise<LinhaExtrato[]> {
  const cid = consultoraId ?? null;

  const gravados = await sql<Array<{
    consultora_id: number; consultora_nome: string | null; data: string;
    venda_id: number | null; pedido: string | null; cliente: string | null;
    forma: string | null; valor_pagamento: string; valor_venda: string;
    data_venda: string | null;
    valor: string; tipo_item: string; devolucao_id: number | null;
    comissao_bruta: string | null; fator_meta: string | null; motivo_fator: string | null;
  }>>`
    SELECT fi.consultora_id, ve.nome AS consultora_nome,
           COALESCE(fi.data_recebimento, fi.created_at::date)::text AS data,
           fi.venda_id, fi.numero_venda_snapshot AS pedido,
           fi.cliente_nome_snapshot AS cliente, fi.forma_recebimento AS forma,
           fi.valor_pagamento::text, fi.valor_venda::text,
           fi.data_venda::text,
           fi.comissao_calculada::text AS valor, fi.tipo_item, fi.devolucao_id,
           fi.comissao_bruta::text, fi.fator_meta::text, fi.motivo_fator
    FROM alissonerp.fechamento_comissao_itens fi
    LEFT JOIN public.vendedores ve ON ve.id_vendedor = fi.consultora_id
    WHERE fi.status NOT IN ('estornado', 'cancelado')
      AND (${cid}::int IS NULL OR fi.consultora_id = ${cid}::int)
      AND COALESCE(fi.data_recebimento, fi.created_at::date) >= ${de}::date
      AND COALESCE(fi.data_recebimento, fi.created_at::date) <= ${ate}::date
    ORDER BY 3
  `;

  const previstos = await sql<Array<{
    consultora_id: number; consultora_nome: string | null; data: string;
    venda_id: number; pedido: string; cliente: string | null; forma: string;
    valor_pagamento: string; total_venda: string; data_venda: string | null;
    valor: string; comissionavel: boolean;
    vale_numero: string | null; vale_pedido_origem: string | null;
  }>>`
    -- ::int obrigatorio: vendas_erp.vendedor_id e BIGINT e o postgres.js devolve
    -- bigint como STRING, enquanto fechamento_comissao_itens.consultora_id e
    -- integer e vem como number. Sem o cast as duas fontes viram chaves
    -- diferentes no agrupamento e cada vendedora aparece DUAS vezes na tela.
    SELECT v.vendedor_id::int AS consultora_id, ven.nome AS consultora_nome,
           pv.data_confirmacao::date::text AS data,
           v.id AS venda_id, v.numero_venda AS pedido, c.nome AS cliente,
           pv.forma, pv.valor::text AS valor_pagamento, v.total_venda::text,
           v.data_venda::text,
           CASE WHEN pv.comissionavel
                THEN ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda, 0), 1), 2)
                ELSE 0 END::text AS valor,
           pv.comissionavel,
           vt.numero AS vale_numero,
           dv.numero_venda AS vale_pedido_origem
    FROM alissonerp.pagamentos_venda pv
    JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
      AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
    LEFT JOIN public.vendedores ven ON ven.id_vendedor = v.vendedor_id
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN alissonerp.vale_troca vt ON vt.id = pv.vale_troca_id
    LEFT JOIN alissonerp.devolucoes_venda d ON d.id = vt.devolucao_id
    LEFT JOIN alissonerp.vendas_erp dv ON dv.id = d.venda_id
    WHERE pv.status = 'confirmado'
      AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
      AND v.vendedor_id IS NOT NULL
      AND pv.data_confirmacao >= ${de}::date
      AND pv.data_confirmacao < ${ate}::date + interval '1 day'
      AND pv.id NOT IN (
        SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
        WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
      )
    ORDER BY 3
  `;

  // A baixa entra no mês da COMPETÊNCIA, não no mês em que o Pix saiu.
  //
  // O PORQUÊ (decisão do Jonathan, 03/08/2026): a comissão de um mês sempre é
  // paga no mês seguinte. Jogando a baixa na data do Pix, todo mês fechava com
  // "ganhei junho, recebi maio" — a consultora não conseguia ler o próprio
  // extrato. Pela competência, cada mês fecha sozinho: o que ela ganhou naquele
  // mês e o que ela recebeu por aquele mês, lado a lado.
  //
  // A data real do pagamento não se perde — vai na descrição da linha.
  //
  // O IMPACTO: `saldoAnterior` tem que usar o MESMO critério (competência), senão
  // o saldo anterior conta um pagamento que o mês ainda não descontou, e a conta
  // não fecha.
  const baixas = await sql<Array<{
    consultora_id: number; consultora_nome: string | null;
    data: string; competencia: string; valor: string; pago_em: string | null;
  }>>`
    SELECT f.consultora_id, ve.nome AS consultora_nome,
           f.periodo_fim::text AS data, f.competencia, f.valor_total::text AS valor,
           f.paid_at::date::text AS pago_em
    FROM alissonerp.fechamentos_comissao f
    LEFT JOIN public.vendedores ve ON ve.id_vendedor = f.consultora_id
    WHERE f.status = 'pago'
      AND (${cid}::int IS NULL OR f.consultora_id = ${cid}::int)
      AND f.competencia >= to_char(${de}::date, 'YYYY-MM')
      AND f.competencia <= to_char(${ate}::date, 'YYYY-MM')
    ORDER BY 3
  `;

  // REGRA DE NEGÓCIO (migration 376): a comissão de uma venda vale o fator da meta
  // do mês EM QUE A VENDA FOI FEITA — não o do mês em que o dinheiro entrou. Por
  // isso a competência sai de `data_venda` (e não de `data`), tanto nas linhas já
  // gravadas quanto nas previstas: uma parcela de setembro paga em março chega com
  // o fator de setembro. IMPACTO se trocar por `data`: a consultora seria premiada
  // ou punida pelo mês em que o cliente resolveu pagar.
  const semComissao = new Set(await getVendedoresSemComissao());
  const competencias = [...new Set(
    [...gravados, ...previstos]
      .map((l) => competenciaDaData(l.data_venda))
      .filter((c): c is string => c != null),
  )];
  const resultados = await resultadosMeta(competencias);

  /** Fator da meta para a venda daquela consultora, com o motivo escrito. */
  const fatorDaLinha = (consultoraId: number, dataVenda: string | null) => {
    const comp = competenciaDaData(dataVenda);
    const res = comp ? resultados.get(chaveResultado(consultoraId, comp)) : undefined;
    return { fator: res?.fator ?? 1, motivo: res && res.fator < 1 ? res.motivo : "" };
  };

  const linhas: LinhaExtrato[] = [];

  for (const g of gravados) {
    // Quem não comissiona também não aparece — inclusive nas linhas já gravadas.
    // O PORQUÊ: `saldoAnterior()` já ignora essas consultoras; mostrar as linhas
    // aqui e não lá deixaria o extrato incoerente (comissões na tela, saldo
    // anterior zerado). Os itens continuam no banco, auditáveis — só saem da tela.
    if (semComissao.has(Number(g.consultora_id))) continue;
    const valor = Number(g.valor);
    const balde = baldeDoItem(g.tipo_item, g.devolucao_id, g.forma, valor);
    linhas.push({
      // Number() em TODAS as fontes: a chave do agrupamento tem que ser do mesmo
      // tipo, senao a mesma vendedora vira duas linhas. Ver o cast ::int acima.
      consultora_id: Number(g.consultora_id),
      consultora_nome: g.consultora_nome,
      data: g.data,
      balde,
      descricao: g.devolucao_id
        ? `${g.forma ?? "Devolução"}${g.pedido ? ` · pedido ${g.pedido}` : ""}`
        : `${g.cliente ?? "—"}${g.pedido ? ` · pedido ${g.pedido}` : ""}${g.forma ? ` · ${g.forma.toLowerCase()}` : ""}`,
      pedido: g.pedido,
      venda_id: g.venda_id,
      cliente: g.cliente,
      forma: g.forma,
      data_venda: g.data_venda,
      valor_pago: g.valor_pagamento ? Number(g.valor_pagamento) : null,
      base_comissao: g.valor_venda ? Number(g.valor_venda) : null,
      itens: null,
      valor,
      previsto: false,
      // Item já gravado NÃO se recalcula — ele é o registro contábil do que foi
      // apurado. Só recuperamos a memória do fator para a tela poder explicar a
      // linha. Item anterior à migration 376 não tem essa memória: fator 1.
      comissao_bruta: g.comissao_bruta != null ? Number(g.comissao_bruta) : valor,
      fator_meta: g.fator_meta != null ? Number(g.fator_meta) : 1,
      motivo_fator: g.motivo_fator ?? "",
    });
  }

  for (const p of previstos) {
    const ehVale = p.forma === "Vale-Troca";
    const consultoraId = Number(p.consultora_id);
    // Loja Alisson (e quem mais estiver na lista) não gera comissão: é vendedor
    // genérico de balcão, sem meta e sem quem receba. Ver COMISSAO_VENDEDORES_EXCLUIDOS.
    if (semComissao.has(consultoraId)) continue;
    const bruto = Number(p.valor);
    const { fator, motivo } = fatorDaLinha(consultoraId, p.data_venda);
    const valorComFator = aplicarFator(bruto, fator);
    linhas.push({
      consultora_id: consultoraId,
      consultora_nome: p.consultora_nome,
      data: p.data,
      // Venda paga com vale-troca é venda do mês, com etiqueta — não "outro crédito".
      balde: "comissao",
      descricao: ehVale
        ? `Vale ${p.vale_numero ?? "—"}${p.vale_pedido_origem ? ` do pedido ${p.vale_pedido_origem}` : ""} usado no pedido ${p.pedido}`
        : `${p.cliente ?? "—"} · pedido ${p.pedido} · ${p.forma.toLowerCase()}`,
      pedido: p.pedido,
      venda_id: p.venda_id,
      cliente: p.cliente,
      forma: p.forma,
      data_venda: p.data_venda,
      valor_pago: Number(p.valor_pagamento),
      base_comissao: Number(p.total_venda),
      itens: null,
      valor: valorComFator,
      previsto: true,
      comissao_bruta: bruto,
      fator_meta: fator,
      motivo_fator: motivo,
    });
  }

  for (const b of baixas) {
    const [ano, mes] = b.competencia.split("-");
    const rotulo = new Date(Number(ano), Number(mes) - 1)
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    linhas.push({
      consultora_id: Number(b.consultora_id),
      consultora_nome: b.consultora_nome,
      data: b.data,
      balde: "pagamento",
      // A data real do Pix não se perde: a linha mora na competência, mas
      // quando o dinheiro saiu fica escrito na descrição.
      descricao: `Pagamento da comissão de ${rotulo}`
        + (b.pago_em ? ` · pago em ${b.pago_em.split("-").reverse().join("/")}` : ""),
      pedido: null,
      venda_id: null,
      cliente: null,
      forma: null,
      data_venda: null,
      valor_pago: null,
      base_comissao: null,
      itens: null,
      valor: -Number(b.valor),
      previsto: false,
      comissao_bruta: -Number(b.valor),
      fator_meta: 1,
      motivo_fator: "",
    });
  }

  // Itens: UMA consulta pro conjunto todo de vendas do mês, não uma por linha —
  // o mesmo pedido costuma aparecer em vários pagamentos e todos apontam pro
  // mesmo array (mesma referência, sem cópia).
  if (comItens) {
    const itens = await itensPorVenda([...new Set(
      linhas.map(l => l.venda_id).filter((id): id is number => id != null),
    )]);
    for (const l of linhas) {
      if (l.venda_id != null) l.itens = itens.get(l.venda_id) ?? null;
    }
  }

  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Saldo acumulado ANTES da data — o "saldo anterior" da tela.
 *
 * ⚠️ Só baixa do saldo o que estiver num fechamento marcado `pago`. Fechamento
 * em rascunho que já foi pago por fora NÃO baixa — o saldo anterior fica
 * inflado até alguém marcar. (Em 03/08/2026 havia R$23.980,57 nessa situação:
 * 6 fechamentos de mai/jun em rascunho, nenhum marcado pago.)
 */
export async function saldoAnterior(
  consultoraId: number | null,
  de: string,
): Promise<Map<number, number>> {
  const cid = consultoraId ?? null;

  const rows = await sql<Array<{
    consultora_id: number; competencia: string | null;
    lancado: string; naolancado: string; pago: string;
  }>>`
    WITH lancado AS (
      SELECT fi.consultora_id, COALESCE(SUM(fi.comissao_calculada), 0) AS v
      FROM alissonerp.fechamento_comissao_itens fi
      WHERE fi.status NOT IN ('estornado', 'cancelado')
        AND (${cid}::int IS NULL OR fi.consultora_id = ${cid}::int)
        AND COALESCE(fi.data_recebimento, fi.created_at::date) < ${de}::date
      GROUP BY 1
    ),
    naolancado AS (
      -- ::int: vendedor_id e bigint; sem o cast o UNION com consultora_id (int)
      -- vira bigint e volta como string, quebrando a chave do Map.
      -- Sai por COMPETÊNCIA DA VENDA (não só por consultora): o fator da meta é
      -- por mês da venda e é aplicado em TS logo abaixo. Somar tudo aqui dentro
      -- devolveria o valor CHEIO e o saldo anterior mentiria para cima.
      SELECT v.vendedor_id::int AS consultora_id,
             to_char(v.data_venda, 'YYYY-MM') AS competencia,
             COALESCE(SUM(ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda, 0), 1), 2)), 0) AS v
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
        AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      WHERE pv.status = 'confirmado' AND pv.comissionavel IS TRUE
        AND v.vendedor_id IS NOT NULL
        AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
        AND pv.data_confirmacao < ${de}::date
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
        )
      GROUP BY 1, 2
    ),
    pago AS (
      -- Por COMPETÊNCIA, igual à baixa em linhasExtrato(). Se aqui olhasse
      -- paid_at e lá competência, o pagamento do mês anterior seria contado
      -- duas vezes (ou nenhuma) e o saldo anterior mentiria.
      SELECT f.consultora_id, COALESCE(SUM(f.valor_total), 0) AS v
      FROM alissonerp.fechamentos_comissao f
      WHERE f.status = 'pago'
        AND (${cid}::int IS NULL OR f.consultora_id = ${cid}::int)
        AND f.competencia < to_char(${de}::date, 'YYYY-MM')
      GROUP BY 1
    )
    SELECT t.c AS consultora_id, n.competencia,
           COALESCE(l.v, 0)::text AS lancado,
           COALESCE(n.v, 0)::text AS naolancado,
           COALESCE(p.v, 0)::text AS pago
    FROM (
      SELECT consultora_id AS c FROM lancado
      UNION SELECT consultora_id FROM naolancado
      UNION SELECT consultora_id FROM pago
    ) t
    LEFT JOIN lancado    l ON l.consultora_id = t.c
    LEFT JOIN naolancado n ON n.consultora_id = t.c
    LEFT JOIN pago       p ON p.consultora_id = t.c
  `;

  // O fator da meta entra aqui, sobre a parte AINDA NÃO LANÇADA — o que já está
  // gravado (`lancado`) é registro contábil e não se recalcula, e o que foi pago
  // saiu pelo valor que saiu. IMPACTO se o fator não fosse aplicado: o saldo
  // anterior viria cheio e o mês seguinte começaria com dívida que não existe.
  const semComissao = new Set(await getVendedoresSemComissao());
  const competencias = [...new Set(rows.map((r) => r.competencia).filter((c): c is string => c != null))];
  const resultados = await resultadosMeta(competencias);

  const saldos = new Map<number, number>();
  const jaContou = new Set<string>();
  for (const r of rows) {
    const cidLinha = Number(r.consultora_id);
    if (semComissao.has(cidLinha)) continue;
    // lancado e pago são por consultora: entram UMA vez, mesmo que a consultora
    // apareça em várias competências de `naolancado`.
    let base = saldos.get(cidLinha) ?? 0;
    if (!jaContou.has(String(cidLinha))) {
      base += Number(r.lancado) - Number(r.pago);
      jaContou.add(String(cidLinha));
    }
    const res = r.competencia ? resultados.get(chaveResultado(cidLinha, r.competencia)) : undefined;
    base += aplicarFator(Number(r.naolancado), res?.fator ?? 1);
    saldos.set(cidLinha, Math.round(base * 100) / 100);
  }

  return saldos;
}

/**
 * Comissões PENDENTES: crediário ainda não pago. Fora do saldo — aparece só
 * como previsão, com a parte já vencida separada.
 */
export async function comissoesPendentes(
  consultoraId: number | null,
): Promise<Map<number, { total: number; atrasado: number; parcelas: number }>> {
  const cid = consultoraId ?? null;

  const rows = await sql<Array<{
    consultora_id: number; competencia: string | null; parcelas: string; total: string; atrasado: string;
  }>>`
    -- Por COMPETÊNCIA DA VENDA: a parcela que ainda vai ser paga já nasce com o
    -- fator do mês da venda. IMPACTO se somar sem isso: a previsão promete um
    -- valor que não vai chegar — foi o que a Cristiane e a Débora veriam depois
    -- de agosto/2026, mês em que a comissão saiu pela metade.
    SELECT v.vendedor_id::int AS consultora_id,
           to_char(v.data_venda, 'YYYY-MM') AS competencia,
           COUNT(*)::text AS parcelas,
           ROUND(SUM(v.total_comissao * LEAST(cr.valor / NULLIF(v.total_venda, 0), 1)), 2)::text AS total,
           ROUND(SUM(CASE WHEN cr.data_vencimento < CURRENT_DATE
                     THEN v.total_comissao * LEAST(cr.valor / NULLIF(v.total_venda, 0), 1)
                     ELSE 0 END), 2)::text AS atrasado
    FROM alissonerp.contas_receber cr
    JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
      AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
    WHERE cr.data_recebimento IS NULL AND cr.situacao = 'pendente'
      AND v.vendedor_id IS NOT NULL
      AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
    GROUP BY 1, 2
  `;

  const semComissao = new Set(await getVendedoresSemComissao());
  const resultados = await resultadosMeta(
    [...new Set(rows.map((r) => r.competencia).filter((c): c is string => c != null))],
  );

  const mapa = new Map<number, { total: number; atrasado: number; parcelas: number }>();
  for (const r of rows) {
    const cidLinha = Number(r.consultora_id);
    if (semComissao.has(cidLinha)) continue;
    const res = r.competencia ? resultados.get(chaveResultado(cidLinha, r.competencia)) : undefined;
    const fator = res?.fator ?? 1;
    const atual = mapa.get(cidLinha) ?? { total: 0, atrasado: 0, parcelas: 0 };
    mapa.set(cidLinha, {
      total: Math.round((atual.total + aplicarFator(Number(r.total ?? 0), fator)) * 100) / 100,
      atrasado: Math.round((atual.atrasado + aplicarFator(Number(r.atrasado ?? 0), fator)) * 100) / 100,
      parcelas: atual.parcelas + Number(r.parcelas),
    });
  }
  return mapa;
}

export interface ParcelaPendente {
  conta_id: number;
  venda_id: number | null;
  pedido: string | null;
  cliente: string | null;
  descricao: string | null;
  vencimento: string | null;
  valor_parcela: number;
  comissao_prevista: number;
  atrasado: boolean;
}

/**
 * As parcelas por trás do total de "comissões pendentes" — para a consultora
 * poder clicar e ver DE QUAIS vendas vem a previsão.
 *
 * REGRA: mesma fonte e mesma conta do total (comissoesPendentes). Se as duas
 * divergirem, a tela mente — por isso o filtro é idêntico.
 */
export async function pendentesDetalhe(consultoraId: number): Promise<ParcelaPendente[]> {
  const rows = await sql<Array<{
    conta_id: number; venda_id: number | null; pedido: string | null;
    cliente: string | null; descricao: string | null; vencimento: string | null;
    valor_parcela: string; comissao_prevista: string; atrasado: boolean;
    data_venda: string | null;
  }>>`
    SELECT cr.id AS conta_id, v.id AS venda_id, v.numero_venda AS pedido,
           COALESCE(c.nome, cr.cliente_nome) AS cliente, cr.descricao,
           cr.data_vencimento::text AS vencimento,
           cr.valor::text AS valor_parcela,
           ROUND(v.total_comissao * LEAST(cr.valor / NULLIF(v.total_venda, 0), 1), 2)::text AS comissao_prevista,
           v.data_venda::text AS data_venda,
           (cr.data_vencimento < CURRENT_DATE) AS atrasado
    FROM alissonerp.contas_receber cr
    JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
      AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE cr.data_recebimento IS NULL AND cr.situacao = 'pendente'
      AND v.vendedor_id = ${consultoraId}
    ORDER BY cr.data_vencimento NULLS LAST, cr.id
  `;

  // O fator do mês DA VENDA também aqui — o detalhe tem que somar exatamente o
  // total de comissoesPendentes(). Se as duas contas divergirem, a tela mente.
  const resultados = await resultadosMeta(
    [...new Set(rows.map((r) => competenciaDaData(r.data_venda)).filter((c): c is string => c != null))],
    [consultoraId],
  );

  return rows.map((r) => ({
    conta_id: Number(r.conta_id),
    venda_id: r.venda_id ? Number(r.venda_id) : null,
    pedido: r.pedido,
    cliente: r.cliente,
    descricao: r.descricao,
    vencimento: r.vencimento,
    valor_parcela: Number(r.valor_parcela),
    comissao_prevista: aplicarFator(
      Number(r.comissao_prevista ?? 0),
      resultados.get(chaveResultado(consultoraId, competenciaDaData(r.data_venda) ?? ""))?.fator ?? 1,
    ),
    atrasado: r.atrasado === true,
  }));
}

/** Soma as linhas de um balde. */
export function somaBalde(linhas: LinhaExtrato[], balde: BaldeExtrato): number {
  return Math.round(
    linhas.filter((l) => l.balde === balde).reduce((s, l) => s + l.valor, 0) * 100,
  ) / 100;
}
