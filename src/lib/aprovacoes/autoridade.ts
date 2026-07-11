/**
 * REGRA DE NEGÓCIO: "quem é o aprovador" e "quem pode decidir", pra qualquer evento.
 * O QUÊ: funções PURAS (testáveis sem banco) + wrappers ASYNC que buscam do banco
 *   e chamam as puras. Config-first: config ativa > fallback por role > master.
 *   Solicitante nunca é o próprio aprovador, exceto master ou eventos com
 *   `solicitantePodeAprovar: true` (ex.: conferência da própria consultora).
 * POR QUÊ: unifica as 3 fontes de verdade hoje divergentes — ver
 *   docs/regras-negocio/aprovacoes-refatoracao/03-FASE-1-camada-central.md.
 * IMPACTO: Fase 1 — nada importa este arquivo fora de src/lib/aprovacoes/ ainda.
 *   As funções async batem no banco de homolog em testes/uso futuro; nesta fase
 *   não são chamadas por nenhum endpoint (zero efeito em produção).
 */
import sql from "@/lib/db";
import { getMasterAdminId } from "@/lib/master-admin";
import { CATALOGO, ACESSO_PLENO } from "./catalogo";
import { registrarOverride } from "./override-log";
import type {
  AprovadorResolvido,
  ContextoAprovacao,
  EventoAprovacao,
  RegraAutoridade,
  ResultadoDecisao,
  TarefaAprovacaoRef,
  UsuarioAprovacao,
} from "./tipos";

export { ACESSO_PLENO };

/** true se a role está na lista única de acesso pleno (resolve o mapa §A). */
export function isAcessoPleno(role: string | null | undefined): boolean {
  return ACESSO_PLENO.includes(role as (typeof ACESSO_PLENO)[number]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PURAS — sem I/O, cobertas pelos testes unitários
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escolhe o aprovador dado os candidatos já resolvidos (config e role, ambos
 * já filtrados por "ativo=true" pelo wrapper async). Ordem: config > role.
 * Solicitante é removido dos candidatos, exceto quando `regra.solicitantePodeAprovar`.
 */
export function escolherAprovador(
  regra: RegraAutoridade,
  configUUIDs: string[],
  candidatosRole: string[],
  solicitanteId?: string,
): AprovadorResolvido | null {
  const semSolicitante = (ids: string[]) =>
    regra.solicitantePodeAprovar ? ids : ids.filter((id) => id !== solicitanteId);

  const config = semSolicitante(configUUIDs);
  if (config.length > 0) return { aprovadorId: config[0], origem: "config" };

  const role = semSolicitante(candidatosRole);
  if (role.length > 0) return { aprovadorId: role[0], origem: "role_fallback" };

  return null;
}

/**
 * Decide se `userId`/`userRole` pode decidir esta aprovação, dado o aprovador
 * já designado (resolvido antes por `resolverAprovador`, na criação da tarefa).
 */
export function avaliarDecisao(
  userRole: string | null,
  userId: string,
  regra: RegraAutoridade,
  aprovadorDesignado: string | null,
  _ctx?: ContextoAprovacao,
): ResultadoDecisao {
  if (aprovadorDesignado && userId === aprovadorDesignado) {
    return { pode: true, viaOverride: false };
  }
  if (regra.permiteOverrideAdmin && isAcessoPleno(userRole)) {
    return { pode: true, viaOverride: true, motivo: "override_admin" };
  }
  if (!aprovadorDesignado && regra.rolesFallback.includes(userRole ?? "")) {
    return { pode: true, viaOverride: false };
  }
  return { pode: false, viaOverride: false, motivo: "nao_e_o_aprovador_nem_tem_cargo_habilitado" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ASYNC (I/O) — buscam config/usuarios e chamam as puras acima
// ═══════════════════════════════════════════════════════════════════════════

/**
 * REGRA DE NEGÓCIO: 'devolucao' é o único evento cuja configKey muda com o
 * contexto — dentro do prazo usa 'aprovadora_credito_gerente'; fora do prazo
 * (>7 dias úteis da entrega) usa 'aprovador_devolucao_fora_prazo'. Replica
 * src/lib/devolucoes.ts:280-286 (solicitarAprovacaoDevolucao).
 */
function configKeysEfetivas(regra: RegraAutoridade, ctx?: ContextoAprovacao): string[] {
  if (regra.evento === "devolucao") {
    return ctx?.foraPrazo ? ["aprovador_devolucao_fora_prazo"] : ["aprovadora_credito_gerente"];
  }
  return regra.configKeys;
}

async function usuarioAtivoPorId(id: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM alissonerp.usuarios WHERE id = ${id}::uuid AND ativo = true LIMIT 1
  `;
  return row ? String(row.id) : null;
}

/** UUIDs ativos configurados nas configKeys efetivas do evento (1ª chave com valor válido). */
async function buscarUUIDsDaConfig(regra: RegraAutoridade, ctx?: ContextoAprovacao): Promise<string[]> {
  const chaves = configKeysEfetivas(regra, ctx);
  if (chaves.length === 0) return [];

  const rows = await sql<{ chave: string; valor: string }[]>`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema WHERE chave = ANY(${chaves})
  `;
  const porChave = new Map(rows.map((r) => [r.chave, r.valor]));
  const valor = chaves.map((c) => porChave.get(c)).find((v): v is string => !!v);
  if (!valor) return [];

  if (regra.configMulti) {
    const ids = valor.split(",").map((s) => s.trim()).filter(Boolean);
    const ativos = await Promise.all(ids.map(usuarioAtivoPorId));
    return ativos.filter((id): id is string => id !== null);
  }

  const ativo = await usuarioAtivoPorId(valor);
  return ativo ? [ativo] : [];
}

async function buscarCandidatosPorRole(roles: readonly string[]): Promise<string[]> {
  if (roles.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM alissonerp.usuarios WHERE role = ANY(${[...roles]}) AND ativo = true
  `;
  return rows.map((r) => String(r.id));
}

/**
 * REGRA DE NEGÓCIO: `conferencia_consultora` — a consultora aprova a PRÓPRIA
 * conferência quando `ctx.consultoraVendedorId` bate com o `vendedor_id` dela
 * em alissonerp.usuarios (mesma checagem de
 * src/app/api/aprovacao/[aprovacaoId]/route.ts). Vira mais um candidato de
 * fallback — não substitui a config nem os cargos de gerência.
 */
async function candidatoAutoAprovacao(regra: RegraAutoridade, ctx?: ContextoAprovacao): Promise<string | null> {
  if (!regra.solicitantePodeAprovar || !ctx?.solicitanteId || ctx?.consultoraVendedorId == null) {
    return null;
  }
  const [u] = await sql<{ vendedor_id: number | null }[]>`
    SELECT vendedor_id FROM alissonerp.usuarios WHERE id = ${ctx.solicitanteId}::uuid AND ativo = true LIMIT 1
  `;
  if (u?.vendedor_id != null && Number(u.vendedor_id) === Number(ctx.consultoraVendedorId)) {
    return ctx.solicitanteId;
  }
  return null;
}

/** Resolve o aprovador designado do evento: config ativa → fallback por role (≠ solicitante) → master. */
export async function resolverAprovador(
  evento: EventoAprovacao,
  ctx?: ContextoAprovacao,
): Promise<AprovadorResolvido> {
  const regra = CATALOGO[evento];

  const configUUIDs = await buscarUUIDsDaConfig(regra, ctx);
  const autoAprovacaoId = await candidatoAutoAprovacao(regra, ctx);
  const candidatosRoleBase = await buscarCandidatosPorRole(regra.rolesFallback);
  const candidatosRole = autoAprovacaoId ? [autoAprovacaoId, ...candidatosRoleBase] : candidatosRoleBase;

  const escolhido = escolherAprovador(regra, configUUIDs, candidatosRole, ctx?.solicitanteId);
  if (escolhido) return escolhido;

  const masterId = await getMasterAdminId();
  return { aprovadorId: masterId, origem: "master" };
}

/**
 * Avalia se `user` pode decidir `evento` para a `tarefa` já existente (aprovador
 * já foi resolvido antes, na criação — `tarefa.aprovadorId`). Se a decisão for
 * via override do admin, registra em audit_log (registrarOverride).
 */
export async function podeDecidir(
  user: UsuarioAprovacao,
  evento: EventoAprovacao,
  tarefa: TarefaAprovacaoRef,
  ctx?: ContextoAprovacao,
): Promise<ResultadoDecisao> {
  const regra = CATALOGO[evento];
  const resultado = avaliarDecisao(user.role, user.id, regra, tarefa.aprovadorId, ctx);
  if (resultado.pode && resultado.viaOverride) {
    await registrarOverride(user, evento, { aprovadorDesignadoId: tarefa.aprovadorId });
  }
  return resultado;
}
