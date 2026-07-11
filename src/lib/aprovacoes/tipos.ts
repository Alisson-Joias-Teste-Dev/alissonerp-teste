/**
 * REGRA DE NEGÓCIO: tipos da camada central de autoridade de aprovações.
 * O QUÊ: contrato compartilhado entre catálogo, autoridade e (nas próximas fases) os endpoints.
 * POR QUÊ: hoje "quem aprova o quê" está espalhado em 3 fontes que não conversam
 *   (configuracoes_sistema, roles.ts, tarefas_regras_aprovacao) — ver
 *   docs/regras-negocio/aprovacoes-refatoracao/02-mapa-esbarros.md.
 * IMPACTO: Fase 1 não pluga em nada ainda. Mudar formato aqui quebra a Fase 2
 *   (golden tests) e a Fase 3 (migração fluxo a fluxo), que dependem deste contrato.
 */

export type EventoAprovacao =
  | "desconto"
  | "cartao_desconto"
  | "credito_gerente"
  | "credito_diretor"
  | "entrega_sem_pagamento"
  | "devolucao"
  | "devolucao_estoque"
  | "compra_comercial"
  | "compra_metal"
  | "recebimento_metal"
  | "conversao"
  | "conversao_sku"
  | "precificacao"
  | "limpeza_ouro"
  | "devolver_peca"
  | "auditoria"
  | "conferencia_consultora"
  | "alteracao_venda";

export interface RegraAutoridade {
  evento: EventoAprovacao;
  rotulo: string;
  /** Chaves em alissonerp.configuracoes_sistema, em ordem de precedência. [] = sem config (cai direto no fallback por role). */
  configKeys: string[];
  /** true = o valor da configKey é uma lista de UUIDs separada por vírgula (ex.: devolver_peca). */
  configMulti?: boolean;
  /** Roles usadas quando a config está vazia/ausente/usuário inativo. */
  rolesFallback: readonly string[];
  /** ACESSO_PLENO pode decidir mesmo não sendo o aprovador designado (fica registrado via registrarOverride). */
  permiteOverrideAdmin: boolean;
  /** Por desenho: o próprio solicitante pode ser o aprovador designado (ex.: conferência da própria consultora). */
  solicitantePodeAprovar?: boolean;
  /** Documentação (dossiê R2/R3): campos que este fluxo lê/escreve fora desta camada. Fase 1 não escreve nada — só documenta pra Fase 3. */
  camposLock?: string[];
  observacao?: string;
}

export interface ContextoAprovacao {
  solicitanteId?: string;
  vendaId?: number;
  /** devolucao: true troca a configKey de 'aprovadora_credito_gerente' para 'aprovador_devolucao_fora_prazo'. */
  foraPrazo?: boolean;
  /** conferencia_consultora: consultora_id (=usuarios.vendedor_id) dono da conferência, pra validar "a própria". */
  consultoraVendedorId?: number;
  [k: string]: unknown;
}

export interface UsuarioAprovacao {
  id: string;
  role: string | null;
}

export type OrigemAprovador = "config" | "role_fallback" | "master";

export interface AprovadorResolvido {
  aprovadorId: string;
  origem: OrigemAprovador;
}

export interface ResultadoDecisao {
  pode: boolean;
  viaOverride: boolean;
  motivo?: string;
}

/**
 * Referência mínima ao registro de aprovação já existente (ex.: aprovacoes_tarefa)
 * usada por `podeDecidir` — o aprovador já foi resolvido antes (por `resolverAprovador`,
 * na criação da tarefa); aqui só se avalia se ESTE usuário pode decidir sobre ELE.
 */
export interface TarefaAprovacaoRef {
  aprovadorId: string | null;
}
