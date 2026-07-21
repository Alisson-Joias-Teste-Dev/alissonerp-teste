/**
 * REGRA DE NEGÓCIO: mapeia uma tarefa (tipo + tags + dados da venda ligada) pro
 * evento do CATÁLOGO de autoridade (src/lib/aprovacoes/catalogo.ts).
 *
 * O QUÊ: espelha EXATAMENTE as condições que
 *   src/app/api/tarefas/[id]/aprovacao/route.ts já usa, em sequência, pra decidir
 *   qual handler por tipo roda — não reinterpreta, só empresta o mesmo critério
 *   pro portão genérico do PATCH (linha ~372) descobrir se a tarefa TEM um
 *   evento de negócio e, se tiver, delegar a decisão pra podeDecidir(evento).
 *   Função PURA (sem I/O) — os dados da venda (venda_id, venda_situacao,
 *   aprovacao_credito_tipo) chegam já resolvidos pelo SELECT que o caller fez.
 *
 * POR QUÊ (docs/regras-negocio/aprovacoes-refatoracao/19-FASE-7-bugs-pos-merge.md,
 *   BUG 1 e BUG 2): antes deste arquivo, o portão genérico só conhecia
 *   aprovacoes_tarefa.aprovador_id (1 UUID só, gravado com o PRIMEIRO da lista
 *   configurada) — o 2º/3º aprovador configurado tomava 403 a não ser que fosse
 *   admin/desenvolvedor (bypass que a política config-first estrita não deveria
 *   ter, 03b-config-first-estrito.md). Ter o evento aqui permite ao portão
 *   consultar a MESMA autoridade (podeDecidir) que os handlers por tipo,
 *   mais abaixo no arquivo, já usam.
 *
 * A ORDEM DOS IFs IMPORTA e é a MESMA do route.ts (testada em sequência, o
 *   primeiro que casar ganha):
 *   1. entrega_sem_pagamento
 *   2. limpeza_ouro (aprovacao_quebra_metal OU protocolo_metal com tag limpeza_ouro:*)
 *   3. cartao_desconto (exige venda_id)
 *   4. desconto (exige venda_id)
 *   5/6. crédito real → credito_diretor (aprovacao_credito_tipo === "diretor") ou
 *      credito_gerente (senão) — a condição de "crédito real" JÁ exclui
 *      desconto_acima/cartao_desconto e tarefas com tag aprovacao_venda
 *   7. devolucao_estoque — SEMPRE antes de devolucao (mesma tarefa pode ter as
 *      duas etapas; a tag devolucao_estoque marca a etapa 2, que tem prioridade)
 *   8. devolucao (só se NÃO tiver a tag devolucao_estoque)
 *   9. compra_comercial
 *   10. recebimento_metal
 *   11. compra_metal
 *   12. garantia_fora_prazo
 *   13. frete_avulso (tipo exclusivo, migration 353 — sem handler de efeito neste
 *       PATCH; o handler de domínio, mais abaixo no route.ts, chama podeDecidir
 *       direto — este mapeamento serve só pro portão genérico saber que existe evento)
 *   14. qualquer outro (geral, sangria, inventario_solicitacao, conversao*) → null
 *
 * `inventario_solicitacao` devolve null DE PROPÓSITO: existe a chave
 *   aprovador_inventario no banco, mas o evento não foi modelado no CATALOGO —
 *   não inventar um aqui. `conversao`/`conversao_sku`/`conversao_reversa`
 *   devolvem null porque não passam por este PATCH (endpoints próprios,
 *   nem chegam a criar linha em aprovacoes_tarefa).
 *
 * IMPACTO SE ALTERADO: se este mapa divergir do route.ts, o portão genérico e o
 *   handler específico do mesmo PATCH podem discordar sobre quem pode decidir —
 *   ou barra quem deveria poder (regressão do BUG 1), ou libera quem não devia.
 *   Qualquer novo `if (tarefaInfo?.tipo === ...)` adicionado ao route.ts precisa
 *   de uma linha correspondente aqui (e um teste em __tests__/evento-da-tarefa).
 */
import type { EventoAprovacao } from "./tipos";
import { ENTREGA_SEM_PAGAMENTO_TIPO } from "@/lib/entrega-sem-pagamento";

export interface TarefaInfoParaEvento {
  venda_id?: number | string | null;
  venda_situacao?: string | null;
  aprovacao_credito_tipo?: string | null;
}

export function eventoDaTarefa(
  tipo: string | null | undefined,
  tags: string[],
  tarefaInfo?: TarefaInfoParaEvento | null,
): EventoAprovacao | null {
  const vendaId = tarefaInfo?.venda_id;
  const vendaSituacao = tarefaInfo?.venda_situacao ?? "";
  const aprovacaoCreditoTipo = tarefaInfo?.aprovacao_credito_tipo;

  if (tipo === ENTREGA_SEM_PAGAMENTO_TIPO || tags.includes("aprov_entrega_sem_pagamento")) {
    return "entrega_sem_pagamento";
  }

  const temTagLimpeza = tags.some((t) => t.startsWith("limpeza_ouro:"));
  if (tipo === "aprovacao_quebra_metal" || (tipo === "protocolo_metal" && temTagLimpeza)) {
    return "limpeza_ouro";
  }

  if (tipo === "cartao_desconto" && !!vendaId) {
    return "cartao_desconto";
  }

  if (tipo === "desconto_acima" && !!vendaId) {
    return "desconto";
  }

  // "Crédito real" (route.ts ~659-666): venda ligada, em estado ativo, com
  // aprovacao_credito_tipo gravado, e não é desconto/cartão/aprovacao_venda.
  const vendaAtiva = !!vendaId && !["cancelado", "entregue", "aprovado"].includes(vendaSituacao);
  const isCreditoReal =
    vendaAtiva &&
    !!aprovacaoCreditoTipo &&
    tipo !== "desconto_acima" &&
    tipo !== "cartao_desconto" &&
    !tags.includes("aprovacao_venda");
  if (isCreditoReal) {
    return aprovacaoCreditoTipo === "diretor" ? "credito_diretor" : "credito_gerente";
  }

  if (tags.includes("devolucao_estoque")) {
    return "devolucao_estoque";
  }

  if (tags.includes("devolucao")) {
    return "devolucao";
  }

  if (tipo === "compra_comercial" || tags.includes("aprovacao_compra_comercial")) {
    return "compra_comercial";
  }

  if (tipo === "recebimento_metal" || tags.includes("aprovacao_recebimento_metal")) {
    return "recebimento_metal";
  }

  if (tipo === "compra_metal" || tags.includes("aprovacao_compra_metal")) {
    return "compra_metal";
  }

  // Garantia fora do prazo (17/07): a tarefa nasce com tipo 'garantia_fora_prazo'
  // (api/garantia/solicitar-aprovacao). Não tem handler de efeito no PATCH — o
  // efeito (consumir a liberação) roda na CRIAÇÃO da ordem. Aqui só serve pro
  // portão genérico saber que existe evento e delegar a decisão pra podeDecidir.
  if (tipo === "garantia_fora_prazo") {
    return "garantia_fora_prazo";
  }

  // Frete avulso solicitado (migration 353): tarefa nasce com tipo 'frete_avulso',
  // exclusivo desse fluxo — não compete com nenhum outro tipo/tag acima, então a
  // posição no final da cadeia é segura (não rouba tarefa de ninguém).
  if (tipo === "frete_avulso") {
    return "frete_avulso";
  }

  return null;
}
