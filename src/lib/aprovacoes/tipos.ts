/**
 * REGRA DE NEGÓCIO: tipos da camada central de autoridade de aprovações.
 * O QUÊ: contrato compartilhado entre catálogo, autoridade e (nas próximas fases) os endpoints.
 * POR QUÊ: hoje "quem aprova o quê" está espalhado em 3 fontes que não conversam
 *   (configuracoes_unificado, roles.ts, tarefas_regras_aprovacao) — ver
 *   docs/regras-negocio/aprovacoes-refatoracao/02-mapa-esbarros.md.
 * POLÍTICA (decisão do Jonathan, 11/07 — 03b-config-first-estrito.md): config-first ESTRITA.
 *   Só o(s) aprovador(es) configurado(s) decide(m) — nem admin, nem cargo, nem dono. Sem
 *   config, ninguém decide (a camada retorna "nao_configurado"; o endpoint, na Fase 3, trava
 *   e avisa pra configurar). Única exceção: conferência da própria consultora.
 * IMPACTO: Fase 1 não pluga em nada ainda. Mudar formato aqui quebra a Fase 2 (golden tests)
 *   e a Fase 3 (migração fluxo a fluxo), que dependem deste contrato.
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
  | "conversao_reversa"
  | "precificacao"
  | "limpeza_ouro"
  | "devolver_peca"
  | "auditoria"
  | "conferencia_consultora"
  | "alteracao_venda"
  | "garantia_fora_prazo"
  | "frete_avulso"
  | "frete_avulso_loja"
  | "fechamento_frete_negativo";

export interface RegraAutoridade {
  evento: EventoAprovacao;
  rotulo: string;
  /** Chaves em alissonerp.configuracoes_unificado, em ordem de precedência. Vazio SÓ na exceção (conferencia_consultora). */
  configKeys: string[];
  /** true = o valor da configKey é lista de UUIDs separada por vírgula. Agora o padrão: todos true (1 ou vários aprovadores por fluxo). */
  configMulti?: boolean;
  /** Por desenho: o próprio solicitante é o aprovador — única exceção à regra "só a config decide" (conferência da própria consultora). */
  solicitantePodeAprovar?: boolean;
  /** Documentação (dossiê R2/R3): campos que este fluxo lê/escreve fora desta camada. Esta camada não escreve nada — só documenta pra Fase 3. */
  camposLock?: string[];
  observacao?: string;
}

export interface ContextoAprovacao {
  solicitanteId?: string;
  vendaId?: number;
  /** conferencia_consultora: consultora_id (=usuarios.vendedor_id) dono da conferência, pra validar "a própria". */
  consultoraVendedorId?: number;
  [k: string]: unknown;
}

export interface UsuarioAprovacao {
  id: string;
  role: string | null;
}

/**
 * Resultado da resolução: ou há aprovador(es) — configurado(s) ou a exceção da consultora —
 * ou NÃO há ninguém. A camada nunca "inventa" um aprovador por cargo ou por ser o dono.
 *
 * REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — mensagem clara de auto-aprovação, frete avulso):
 * `apenasSolicitante` distingue os DOIS motivos possíveis de "nao_configurado":
 *   - config vazia/ausente desde sempre → `apenasSolicitante` fica ausente/false;
 *   - havia gente configurada, mas SOBROU só quem está solicitando (o wrapper async
 *     `resolverAprovadores` já removeu o solicitante da lista antes de chamar
 *     `resolverPorConfig`) → `apenasSolicitante: true`.
 * POR QUÊ: "ninguém decide porque não configuraram" e "ninguém decide porque só tem
 *   você no pool e você não pode aprovar o próprio pedido" são erros operacionais
 *   DIFERENTES — o segundo tem solução óbvia (pedir pra configurar mais um aprovador)
 *   e não pode aparecer como "Sem permissão" genérico pro solicitante.
 * IMPACTO SE REMOVIDO: `podeDecidir` volta a devolver o mesmo motivo genérico
 *   ("aprovador_nao_configurado") pros dois casos — quem solicita e é o único do pool
 *   vê uma mensagem que não explica a segregação de função.
 */
export type ResolucaoAprovador =
  | { status: "ok"; aprovadores: string[]; origem: "config" | "auto_consultora" }
  | { status: "nao_configurado"; evento: EventoAprovacao; configKeys: string[]; apenasSolicitante?: boolean };

export interface ResultadoDecisao {
  pode: boolean;
  motivo?: string;
}
