import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { cacheGet, cacheSet, cacheInvalidarPrefixo } from "@/lib/cache-memoria";

/**
 * Validade do cache de permissao, em milissegundos.
 *
 * O PORQUE de 60s: permissao muda muito raramente (so quando alguem mexe no
 * painel de configuracoes), mas era consultada no banco em TODA requisicao —
 * `temAcessoModulo` sozinha e usada em 43 rotas. Era consulta desperdicada
 * disputando o pool de conexoes.
 *
 * O IMPACTO: alteracao feita PELO PAINEL vale na hora (as rotas de escrita
 * chamam invalidarCachePermissoes*). So alteracao feita DIRETO NO BANCO
 * demora ate 60s para valer.
 */
const TTL_PERMISSAO_MS = 60_000;

/** Prefixo da chave de permissao granular por usuario: `perm:<userId>:<acao>` */
const PREFIXO_PERM = "perm:";
/** Prefixo da chave de acesso a modulo por role: `mod:<role>:<modulo>` */
const PREFIXO_MOD = "mod:";

/**
 * Verifica se um usuário tem permissão para uma ação.
 * Admin e desenvolvedor sempre passam (fullAccess).
 * Para outros roles, consulta alissonerp.permissoes_usuario.
 *
 * Resultado cacheado por TTL_PERMISSAO_MS (ver comentario acima).
 */
export async function temPermissao(
  userId: string,
  acao: string,
  role: string,
): Promise<boolean> {
  if (isFullAccess(role)) return true;

  const chave = `${PREFIXO_PERM}${userId}:${acao}`;
  const cacheado = cacheGet<boolean>(chave, TTL_PERMISSAO_MS);
  if (cacheado !== undefined) return cacheado;

  const [row] = await sql`
    SELECT permitido
    FROM alissonerp.permissoes_usuario
    WHERE usuario_id = ${userId}::uuid
      AND acao = ${acao}
  `;

  const permitido = row?.permitido === true;
  cacheSet(chave, permitido);
  return permitido;
}

/**
 * Verifica acesso a um módulo via role_permissoes (configurável no painel).
 * Admin/desenvolvedor sempre passam.
 *
 * Resultado cacheado por TTL_PERMISSAO_MS. A chave e por (role, modulo) — nao
 * por usuario — entao a quantidade de entradas e pequena e o acerto de cache
 * e altissimo (todos os usuarios de um mesmo cargo compartilham a resposta).
 */
export async function temAcessoModulo(
  role: string,
  modulo: string,
  tipo: "ler" | "escrever" = "ler",
): Promise<boolean> {
  if (isFullAccess(role)) return true;

  const chave = `${PREFIXO_MOD}${role}:${modulo}`;
  let linha = cacheGet<{ pode_ler: boolean; pode_escrever: boolean } | null>(
    chave,
    TTL_PERMISSAO_MS,
  );

  if (linha === undefined) {
    const [row] = await sql`
      SELECT pode_ler, pode_escrever
      FROM alissonerp.role_permissoes
      WHERE role = ${role} AND modulo = ${modulo}
    `;
    linha = row
      ? { pode_ler: row.pode_ler === true, pode_escrever: row.pode_escrever === true }
      : null;
    cacheSet(chave, linha);
  }

  return tipo === "ler" ? linha?.pode_ler === true : linha?.pode_escrever === true;
}

/**
 * Limpa o cache de permissoes granulares de UM usuario (todas as acoes).
 *
 * O QUE FAZ: apaga as chaves `perm:<userId>:*`.
 * O PORQUE: sem isso, alterar permissao no painel so faria efeito depois do TTL.
 * O IMPACTO SE REMOVIDO: o admin muda a permissao, o usuario continua com o
 * acesso antigo por ate 60s — parece bug para quem esta operando.
 *
 * CHAMAR SEMPRE apos INSERT/UPDATE/DELETE em alissonerp.permissoes_usuario.
 */
export function invalidarCachePermissoesUsuario(userId: string): void {
  cacheInvalidarPrefixo(`${PREFIXO_PERM}${userId}:`);
}

/**
 * Limpa o cache de acesso a modulos de UM cargo (todos os modulos).
 *
 * O QUE FAZ: apaga as chaves `mod:<role>:*`.
 * O PORQUE / IMPACTO: mesmo raciocinio de invalidarCachePermissoesUsuario.
 *
 * CHAMAR SEMPRE apos INSERT/UPDATE/DELETE em alissonerp.role_permissoes.
 */
export function invalidarCachePermissoesRole(role: string): void {
  cacheInvalidarPrefixo(`${PREFIXO_MOD}${role}:`);
}
