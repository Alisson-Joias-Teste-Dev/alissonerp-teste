/**
 * REGRA DE NEGÓCIO: "quem pode decidir" cada evento de aprovação — política
 * CONFIG-FIRST ESTRITA (decisão do Jonathan, 11/07 — 03b-config-first-estrito.md).
 * O QUÊ: funções PURAS (testáveis sem banco) + wrappers ASYNC que buscam a config e
 *   chamam as puras. Só o(s) aprovador(es) configurado(s) em Configurações decide(m).
 *   SEM fallback por cargo, SEM master, SEM override de admin — nem admin decide se
 *   não estiver na lista configurada. Config vazia/ausente/todos inativos → a camada
 *   nunca escolhe sozinha: retorna "nao_configurado" (o endpoint, na Fase 3, trava e
 *   avisa pra configurar). Única exceção: conferência da própria consultora.
 * POR QUÊ: substitui a política original da Fase 1 (fallback por cargo + override de
 *   admin). O Opus achou um bug de não-determinismo no fallback (busca por cargo sem
 *   ORDER BY); na revisão, o Jonathan foi na raiz — "o sistema segue a role, não a
 *   config" — e decidiu eliminar o fallback por completo, não só corrigir o sintoma.
 * IMPACTO: Fase 1 — nada importa este arquivo fora de src/lib/aprovacoes/ ainda.
 */
import sql from "@/lib/db";
import { CATALOGO } from "./catalogo";
import type {
  ContextoAprovacao,
  EventoAprovacao,
  RegraAutoridade,
  ResolucaoAprovador,
  ResultadoDecisao,
  UsuarioAprovacao,
} from "./tipos";

// ═══════════════════════════════════════════════════════════════════════════
// PURAS — sem I/O, cobertas pelos testes unitários
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve os aprovadores dado os UUIDs já buscados (ativos e ≠ solicitante — feito
 * pelo wrapper async antes de chamar esta função). Sem cargo, sem master: config
 * vazia = "nao_configurado" — esta função nunca escolhe ninguém por conta própria.
 */
export function resolverPorConfig(
  regra: RegraAutoridade,
  configUUIDs: string[],
  autoConsultoraId?: string,
): ResolucaoAprovador {
  if (regra.solicitantePodeAprovar && autoConsultoraId) {
    return { status: "ok", aprovadores: [autoConsultoraId], origem: "auto_consultora" };
  }
  if (configUUIDs.length > 0) {
    return { status: "ok", aprovadores: configUUIDs, origem: "config" };
  }
  return { status: "nao_configurado", evento: regra.evento, configKeys: regra.configKeys };
}

/** user pode decidir se está na lista de aprovadores ATUAL (config resolvida agora, não snapshot). */
export function avaliarDecisao(userId: string, aprovadores: string[]): ResultadoDecisao {
  return aprovadores.includes(userId)
    ? { pode: true }
    : { pode: false, motivo: "nao_e_aprovador_configurado" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ASYNC (I/O) — buscam a config e chamam as puras acima
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chaves efetivas do evento. Nenhum evento depende mais de contexto pra escolher a
 * chave (Fase 3e removeu o caso de 'devolucao' por prazo — decisão do Jonathan: 1
 * aprovador só, sem distinção dentro/fora dos 7 dias úteis).
 */
function configKeysEfetivas(regra: RegraAutoridade, _ctx?: ContextoAprovacao): string[] {
  return regra.configKeys;
}

async function usuarioAtivoPorId(id: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM alissonerp.usuarios WHERE id = ${id}::uuid AND ativo = true LIMIT 1
  `;
  return row ? String(row.id) : null;
}

/**
 * UUIDs ativos configurados (1ª chave efetiva com valor). Toda config é tratada como
 * lista separada por vírgula — com 1 UUID só, o split vira um array de 1 elemento.
 */
async function buscarUUIDsDaConfig(regra: RegraAutoridade, ctx?: ContextoAprovacao): Promise<string[]> {
  const chaves = configKeysEfetivas(regra, ctx);
  if (chaves.length === 0) return [];

  const rows = await sql<{ chave: string; valor: string }[]>`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema WHERE chave = ANY(${chaves})
  `;
  const porChave = new Map(rows.map((r) => [r.chave, r.valor]));
  const valor = chaves.map((c) => porChave.get(c)).find((v): v is string => !!v);
  if (!valor) return [];

  const ids = valor.split(",").map((s) => s.trim()).filter(Boolean);
  const ativos = await Promise.all(ids.map(usuarioAtivoPorId));
  return ativos.filter((id): id is string => id !== null);
}

/**
 * REGRA DE NEGÓCIO: `conferencia_consultora` — a consultora aprova a PRÓPRIA
 * conferência quando `ctx.consultoraVendedorId` bate com o `vendedor_id` dela em
 * alissonerp.usuarios (mesma checagem de
 * src/app/api/aprovacao/[aprovacaoId]/route.ts). Única exceção à política
 * config-first — não há aprovador a configurar pra este evento.
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

/**
 * Resolve quem decide o evento: config ativa (≠ solicitante) → auto-aprovação (exceção) →
 * "nao_configurado".
 *
 * REGRA DE NEGÓCIO (BLOCO 2, jul/2026 — mensagem clara de auto-aprovação): guarda se a
 * config TINHA gente antes de excluir o solicitante (`configUUIDsBrutos`) — se sobrou
 * vazio só por causa dessa exclusão (não porque a config em si estava vazia), marca
 * `apenasSolicitante: true` na resolução. Ver comentário de `ResolucaoAprovador` em
 * tipos.ts para o motivo de distinguir os dois casos.
 * IMPACTO SE REMOVIDO: `podeDecidir` não tem como diferenciar "ninguém configurado" de
 * "só tinha o solicitante configurado" — mensagem ao usuário fica genérica demais.
 */
export async function resolverAprovadores(
  evento: EventoAprovacao,
  ctx?: ContextoAprovacao,
): Promise<ResolucaoAprovador> {
  const regra = CATALOGO[evento];

  const configUUIDsBrutos = await buscarUUIDsDaConfig(regra, ctx);
  let configUUIDs = configUUIDsBrutos;
  if (!regra.solicitantePodeAprovar && ctx?.solicitanteId) {
    configUUIDs = configUUIDs.filter((id) => id !== ctx.solicitanteId);
  }
  const apenasSolicitante = configUUIDsBrutos.length > 0 && configUUIDs.length === 0;
  const autoConsultoraId = (await candidatoAutoAprovacao(regra, ctx)) ?? undefined;

  const resolucao = resolverPorConfig(regra, configUUIDs, autoConsultoraId);
  if (resolucao.status === "nao_configurado" && apenasSolicitante) {
    return { ...resolucao, apenasSolicitante: true };
  }
  return resolucao;
}

/**
 * Autoridade = config ATUAL, não snapshot da tarefa: re-resolve os aprovadores agora
 * e checa se `user` está na lista. Sem config configurada, ninguém decide.
 *
 * REGRA DE NEGÓCIO (BLOCO 2, jul/2026): motivo "aprovador_e_o_proprio_solicitante"
 * (em vez do genérico "aprovador_nao_configurado") quando a resolução veio vazia
 * PORQUE o único configurado era quem está solicitando — ver resolverAprovadores.
 * IMPACTO SE REMOVIDO: o endpoint (aprovacao/route.ts) não tem como montar uma
 * mensagem que explique a segregação de função pro solicitante.
 */
export async function podeDecidir(
  user: UsuarioAprovacao,
  evento: EventoAprovacao,
  ctx?: ContextoAprovacao,
): Promise<ResultadoDecisao> {
  const r = await resolverAprovadores(evento, ctx);
  if (r.status === "nao_configurado") {
    return {
      pode: false,
      motivo: r.apenasSolicitante ? "aprovador_e_o_proprio_solicitante" : "aprovador_nao_configurado",
    };
  }
  return avaliarDecisao(user.id, r.aprovadores);
}
