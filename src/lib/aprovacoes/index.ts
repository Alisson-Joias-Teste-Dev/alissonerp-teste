/**
 * Camada central de autoridade de aprovações — re-exports públicos.
 * Fase 1 (docs/regras-negocio/aprovacoes-refatoracao/03-FASE-1-camada-central.md):
 * NENHUM endpoint deve importar daqui ainda (Strangler Fig — nasce ao lado do código atual).
 */
export type {
  EventoAprovacao,
  RegraAutoridade,
  ContextoAprovacao,
  UsuarioAprovacao,
  AprovadorResolvido,
  OrigemAprovador,
  ResultadoDecisao,
  TarefaAprovacaoRef,
} from "./tipos";

export { CATALOGO } from "./catalogo";

export {
  ACESSO_PLENO,
  isAcessoPleno,
  escolherAprovador,
  avaliarDecisao,
  resolverAprovador,
  podeDecidir,
} from "./autoridade";

export { registrarOverride } from "./override-log";
export type { AlvoOverride } from "./override-log";
