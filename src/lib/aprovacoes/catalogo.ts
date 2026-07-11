/**
 * REGRA DE NEGÓCIO: catálogo — a autoridade ALVO de cada evento de aprovação.
 * O QUÊ: 1 entrada por EventoAprovacao, já com a política UNIFICADA (a correta),
 *   substituindo as 4 definições divergentes de "acesso pleno" (mapa §A) e as
 *   chaves de config hoje ignoradas pela role (mapa §B).
 * POR QUÊ: a Fase 2 (golden tests) captura o comportamento ATUAL de cada fluxo;
 *   na Fase 3, ao migrar, o golden test acusa toda divergência entre o atual e
 *   este catálogo — o Jonathan valida se é o fix desejado (README, "por que a
 *   política já nasce unificada").
 * IMPACTO: nada lê este catálogo em produção ainda (Fase 1 não pluga em nada).
 *   Alterar `configKeys`/`rolesFallback`/`permiteOverrideAdmin` aqui já é decisão
 *   de negócio para quando a Fase 3 migrar o fluxo correspondente.
 */
import { ROLES_METAL_APROVACOES } from "@/lib/roles";
import type { EventoAprovacao, RegraAutoridade } from "./tipos";

/**
 * Lista única de "acesso pleno" — resolve as 4 definições divergentes hoje
 * espalhadas em roles.ts/rotas (isFullAccess, ROLES_FINANCEIRO x2, FULL_ROLES,
 * override do despachante). Nenhuma outra lista de "acesso total" nesta camada.
 */
export const ACESSO_PLENO = ["admin", "desenvolvedor", "diretor"] as const;

/**
 * REGRA DE NEGÓCIO: mesma lista usada hoje em
 * src/app/api/crediario/reserva/[vendaId]/devolver-peca/route.ts (fallback de
 * cargo quando a config `aprovadores_devolver_peca` está vazia).
 * NÃO está exportada em src/lib/roles.ts (só existe como const local naquela
 * rota) — replicada aqui em vez de alterar roles.ts, que é fora do escopo da
 * Fase 1. Reportado ao Jonathan/Opus para decidir se promove pra roles.ts na
 * Fase 3, quando o endpoint for migrado.
 */
const ROLES_ESTOQUE_DEVOLVER_PECA = [
  "gerente_fabrica",
  "estoquista_fabrica",
  "estoquista_loja",
  "gerente_loja",
  "pcp",
] as const;

export const CATALOGO: Record<EventoAprovacao, RegraAutoridade> = {
  desconto: {
    evento: "desconto",
    rotulo: "Desconto acima do limite",
    configKeys: ["aprovador_desconto_padrao"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: [
      "vendas_erp.aprovacao_desconto_tarefa_id",
      "vendas_erp.desconto_aprovado_por",
      "vendas_erp.desconto_aprovado_em",
    ],
    observacao:
      "Unifica as 3 portas de hoje (tarefa 0,5% comissão / por-item 0% / atalho não mexe — mapa §D). " +
      "Campo canônico do desconto aprovado é vendas_erp.desconto_aprovado_por (dossiê R3) — " +
      "vendas-aprovar.ts e baixa-credito.ts leem exatamente esse campo pra destravar a venda.",
  },
  cartao_desconto: {
    evento: "cartao_desconto",
    rotulo: "Desconto no pagamento em cartão",
    configKeys: ["aprovador_cartao_desconto_padrao"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: [
      "vendas_erp.aprovacao_cartao_desconto_tarefa_id",
      "vendas_erp.desconto_cartao_aprovado_por",
      "vendas_erp.desconto_cartao_aprovado_em",
    ],
  },
  credito_gerente: {
    evento: "credito_gerente",
    rotulo: "Crédito / A Receber — aprovação de gerente",
    configKeys: ["aprovadora_credito_gerente"],
    rolesFallback: ["gerente_loja", ...ACESSO_PLENO],
    permiteOverrideAdmin: true,
    camposLock: [
      "vendas_erp.aprovacao_credito_tarefa_id",
      "vendas_erp.aprovacao_credito_tipo",
      "vendas_erp.credito_gerente_usado",
    ],
  },
  credito_diretor: {
    evento: "credito_diretor",
    rotulo: "Crédito / A Receber — aprovação de diretor (zera comissão)",
    configKeys: ["aprovador_credito_diretor"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: [
      "vendas_erp.aprovacao_credito_tarefa_id",
      "vendas_erp.aprovacao_credito_tipo",
      "itens_venda_erp.pct_comissao",
      "itens_venda_erp.valor_comissao",
      "vendas_erp.total_comissao",
    ],
  },
  entrega_sem_pagamento: {
    evento: "entrega_sem_pagamento",
    rotulo: "Entregar devendo (crediário ②)",
    configKeys: ["aprovador_entrega_sem_pagamento"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: [
      "vendas_entrega_excecoes_pagamento.status",
      "pagamentos_venda (forma 'A Receber')",
      "contas_receber",
    ],
    observacao: "Hoje exige aprovador configurado (409 se ausente) — manter esse requisito.",
  },
  devolucao: {
    evento: "devolucao",
    rotulo: "Devolução — aprovação da compensação (crédito/vale)",
    configKeys: ["aprovadora_credito_gerente", "aprovador_devolucao_fora_prazo"],
    rolesFallback: ["gerente_loja", ...ACESSO_PLENO],
    permiteOverrideAdmin: true,
    camposLock: ["devolucoes_venda.status", "devolucoes_venda.tarefa_id"],
    observacao:
      "Chave depende de ctx.foraPrazo: dentro do prazo usa 'aprovadora_credito_gerente'; " +
      "fora do prazo (>7 dias úteis da entrega) usa 'aprovador_devolucao_fora_prazo' — replica " +
      "src/lib/devolucoes.ts:280-286 (solicitarAprovacaoDevolucao).",
  },
  devolucao_estoque: {
    evento: "devolucao_estoque",
    rotulo: "Devolução — conferência do estoque (baixa física)",
    configKeys: ["aprovador_devolucao_estoque"],
    rolesFallback: ["gerente_fabrica", "estoquista_fabrica", ...ACESSO_PLENO],
    permiteOverrideAdmin: true,
    camposLock: ["devolucoes_venda.status (aguardando_aprovacao_estoque)", "devolucoes_venda.tarefa_id"],
  },
  compra_comercial: {
    evento: "compra_comercial",
    rotulo: "Compra comercial — divergência de peso/cadastro",
    configKeys: ["aprovador_compra_comercial"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: [
      "compras_comercial.situacao",
      "compras_comercial.bloqueado",
      "compras_comercial.aprovador_id",
      "compras_comercial.tarefa_aprovacao_id",
    ],
    observacao: "Dossiê R4: aprovação hoje pode duplicar contas_pagar com a chegada — fix é da Fase 4, não desta.",
  },
  compra_metal: {
    evento: "compra_metal",
    rotulo: "Compra de metal acima do teto",
    configKeys: ["metal_aprovador_id"],
    rolesFallback: ROLES_METAL_APROVACOES,
    permiteOverrideAdmin: true,
    camposLock: ["compras_metal_aprovacoes.status", "compras_metal.status"],
    observacao: "FIX (mapa §B): hoje a decisão ignora metal_aprovador_id e só checa role.",
  },
  recebimento_metal: {
    evento: "recebimento_metal",
    rotulo: "Recebimento de metal acima do teto",
    configKeys: ["metal_aprovador_id"],
    rolesFallback: ROLES_METAL_APROVACOES,
    permiteOverrideAdmin: true,
    camposLock: ["recebimentos_metal.status", "creditos_cliente", "vendas_erp.total_venda"],
    observacao: "FIX (mapa §B): idem compra_metal.",
  },
  conversao: {
    evento: "conversao",
    rotulo: "Conversão de estoque em peso (vira Caixa de Ouro)",
    configKeys: [],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: ["conversoes_estoque.status_conversao", "tarefas.status"],
    observacao: "Dossiê R6: se aprovada pela via genérica de tarefas (sem handler dedicado) fica presa em pendente.",
  },
  conversao_sku: {
    evento: "conversao_sku",
    rotulo: "Conversão SKU (troca de peça, via protocolo)",
    configKeys: [],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: ["conversoes_sku.status_conversao", "tarefas.status"],
    observacao: "Dossiê R6: mesmo risco de handler ausente na via genérica.",
  },
  precificacao: {
    evento: "precificacao",
    rotulo: "Alteração de markup (precificação)",
    configKeys: ["aprovador_precificacao"],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: ["markup_alteracoes.status"],
    observacao:
      "Chave 'aprovador_precificacao' ainda não existe em configuracoes_sistema — deixado preparado " +
      "(config-first funciona sozinho assim que a chave for criada, sem mudar código).",
  },
  limpeza_ouro: {
    evento: "limpeza_ouro",
    rotulo: "Quebra de limpeza de ouro (aprovação de peso)",
    configKeys: ["aprovador_limpeza"],
    rolesFallback: [],
    permiteOverrideAdmin: false,
    camposLock: ["cofre_ouro_baixas.status", "limpezas_ouro.status"],
    observacao: "Rígido por desenho — só o UUID configurado decide, SEM fallback por role e SEM override do admin.",
  },
  devolver_peca: {
    evento: "devolver_peca",
    rotulo: "Devolução de peça segurada (crediário ③ virou_credito)",
    configKeys: ["aprovadores_devolver_peca"],
    configMulti: true,
    rolesFallback: ROLES_ESTOQUE_DEVOLVER_PECA,
    permiteOverrideAdmin: true,
    camposLock: ["reservas_estoque_comercial.status"],
  },
  auditoria: {
    evento: "auditoria",
    rotulo: "Auditoria — parecer final",
    configKeys: ["aprovador_auditoria"],
    rolesFallback: ["gerente_loja", "gerente_fabrica", ...ACESSO_PLENO],
    permiteOverrideAdmin: true,
    camposLock: ["auditorias.situacao", "auditorias.parecer", "auditorias.motivo_reprovacao"],
    observacao: "FIX (mapa §C): hoje é brecha total — a rota não checa cargo nenhum (`void user`).",
  },
  conferencia_consultora: {
    evento: "conferencia_consultora",
    rotulo: "Conferência de venda pela própria consultora",
    configKeys: [],
    rolesFallback: ["gerente_loja", "gerente_fabrica", ...ACESSO_PLENO],
    permiteOverrideAdmin: true,
    solicitantePodeAprovar: true,
    camposLock: ["aprovacoes_consultora.etapas"],
    observacao:
      "Por desenho: a consultora aprova a própria conferência (usuarios.vendedor_id === " +
      "aprovacoes_consultora.consultora_id, ver src/app/api/aprovacao/[aprovacaoId]/route.ts) — " +
      "NÃO pode aprovar a de outra consultora.",
  },
  alteracao_venda: {
    evento: "alteracao_venda",
    rotulo: "Solicitação de alteração de venda (campo restrito ou pagamento)",
    configKeys: [],
    rolesFallback: ACESSO_PLENO,
    permiteOverrideAdmin: true,
    camposLock: ["solicitacoes_alteracao.status", "vendas_erp (campo varia por tipo)"],
    observacao: "Era ROLES_FINANCEIRO inline em solicitacoes-alteracao/[id]:26 — hoje já igual a ACESSO_PLENO.",
  },
};
