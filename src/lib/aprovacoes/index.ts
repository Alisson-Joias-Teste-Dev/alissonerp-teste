/**
 * Camada central de autoridade de aprovações — re-exports públicos.
 * Política config-first ESTRITA (docs/regras-negocio/aprovacoes-refatoracao/03b-config-first-estrito.md):
 * só o(s) aprovador(es) configurado(s) decide(m) — sem cargo, sem master, sem override de admin.
 * Fase 1: NENHUM endpoint deve importar daqui ainda (Strangler Fig — nasce ao lado do código atual).
 */
export type {
  EventoAprovacao,
  RegraAutoridade,
  ContextoAprovacao,
  UsuarioAprovacao,
  ResolucaoAprovador,
  ResultadoDecisao,
} from "./tipos";

export { CATALOGO } from "./catalogo";

export {
  resolverPorConfig,
  avaliarDecisao,
  resolverAprovadores,
  podeDecidir,
} from "./autoridade";

export type { TarefaInfoParaEvento } from "./evento-da-tarefa";
export { eventoDaTarefa } from "./evento-da-tarefa";
