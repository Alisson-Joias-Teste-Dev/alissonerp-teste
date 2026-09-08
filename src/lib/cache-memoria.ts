/**
 * CACHE EM MEMORIA COM VALIDADE (TTL) — otimizacao de performance.
 *
 * O QUE FAZ: guarda respostas curtas na memoria do processo Node por alguns
 * segundos, para nao consultar o banco a mesma coisa varias vezes seguidas.
 *
 * O PORQUE: toda requisicao do ERP consultava o banco para descobrir "quem e
 * esse usuario" e "ele tem permissao?" ANTES de fazer o trabalho de verdade.
 * Eram ~3 idas ao banco por clique, todas disputando o mesmo pool de conexoes
 * (src/lib/db.ts). Cacheando identidade e permissao, sobra pool para o
 * trabalho real e o ERP responde mais rapido.
 *
 * O IMPACTO SE ALTERADO/REMOVIDO:
 *  - Removendo, volta a carga de ~3 consultas por requisicao (lentidao).
 *  - O cache vive NA MEMORIA DO PROCESSO. O ERP roda em 1 container so, entao
 *    invalidar aqui limpa para todo mundo. SE UM DIA SUBIR MAIS DE UMA REPLICA,
 *    cada replica tera seu proprio cache e a invalidacao so atinge a que
 *    recebeu a requisicao — nesse cenario, trocar por Redis ou baixar o TTL.
 *  - Quem escreve em usuarios/permissoes DEVE chamar cacheInvalidar* logo apos
 *    o UPDATE/INSERT, senao a mudanca demora ate o TTL para valer.
 */

interface Entrada<T> {
  valor: T;
  /** timestamp (ms) em que a entrada foi gravada */
  gravadoEm: number;
}

/**
 * Teto de entradas. Protege contra crescimento infinito de memoria caso as
 * chaves sejam muito variadas (ex: muitos usuarios x muitas acoes).
 * Ao estourar, descarta a entrada mais antiga inserida (FIFO — o Map do JS
 * preserva ordem de insercao).
 */
const MAX_ENTRADAS = 5_000;

const cache = new Map<string, Entrada<unknown>>();

/**
 * Le do cache. Devolve `undefined` se a chave nao existe OU se ja passou do TTL
 * (nesse caso a entrada vencida e removida na hora — limpeza preguicosa).
 */
export function cacheGet<T>(chave: string, ttlMs: number): T | undefined {
  const entrada = cache.get(chave);
  if (!entrada) return undefined;

  if (Date.now() - entrada.gravadoEm >= ttlMs) {
    cache.delete(chave);
    return undefined;
  }

  return entrada.valor as T;
}

/** Grava no cache, reiniciando a contagem do TTL. */
export function cacheSet<T>(chave: string, valor: T): void {
  // Re-inserir move a chave para o fim da ordem do Map, mantendo o FIFO honesto.
  if (cache.has(chave)) cache.delete(chave);

  if (cache.size >= MAX_ENTRADAS) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga !== undefined) cache.delete(maisAntiga);
  }

  cache.set(chave, { valor, gravadoEm: Date.now() });
}

/** Remove uma chave especifica. Use apos alterar o dado que ela representa. */
export function cacheInvalidar(chave: string): void {
  cache.delete(chave);
}

/**
 * Remove todas as chaves que comecam com o prefixo.
 * Ex: `cacheInvalidarPrefixo("perm:<uuid>:")` limpa todas as acoes daquele
 * usuario de uma vez, sem precisar saber quais foram cacheadas.
 */
export function cacheInvalidarPrefixo(prefixo: string): void {
  for (const chave of cache.keys()) {
    if (chave.startsWith(prefixo)) cache.delete(chave);
  }
}

/** Esvazia o cache inteiro. Uso previsto: testes e emergencia operacional. */
export function cacheLimparTudo(): void {
  cache.clear();
}

/** Quantidade de entradas guardadas. Uso previsto: testes e diagnostico. */
export function cacheTamanho(): number {
  return cache.size;
}
