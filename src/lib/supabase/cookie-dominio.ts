/**
 * Domínio em que o cookie de sessão do Supabase é gravado.
 *
 * POR QUE EXISTE: no estrangulamento, a tela do V2 abre dentro de um iframe na
 * página do V1. Se os dois estiverem em domínios diferentes, o navegador trata
 * o iframe como TERCEIRO e não manda cookie nenhum — a tela do V2 não tem como
 * saber que a pessoa já entrou, e pede login de novo. Gravando o cookie no
 * domínio-pai (`.alissonjoias.com.br`), os dois passam a enxergar a mesma
 * sessão.
 *
 * 🔴 O QUE ISSO ALARGA: qualquer subdomínio de `alissonjoias.com.br` passa a
 * conseguir ler a sessão de quem está logado. É o preço de compartilhar login
 * entre dois sistemas, e só vale enquanto todos os subdomínios forem seus.
 * Hospedar coisa de terceiro sob esse domínio expõe a sessão.
 *
 * Vazio ou ausente = comportamento de antes (cookie só no host atual). É esse
 * o caminho de volta, e é por isso que é variável e não constante no código.
 */
// 🔴 NEXT_PUBLIC_ NAO E ENFEITE: quem grava o cookie no LOGIN e o cliente de
// NAVEGADOR (`(auth)/login/page.tsx:38`), e no navegador so existem as
// variaveis com esse prefixo — o Next as assa no bundle em tempo de build.
// Com `COOKIE_DOMAIN` sozinho, o servidor gravava com dominio e o login
// gravava sem: o cookie do login vencia, e a tela do V2 nao o enxergava.
// A segunda leitura mantem quem ja usava a variavel antiga no servidor.
const bruto = (process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? process.env.COOKIE_DOMAIN)?.trim();
export const DOMINIO_COOKIE: string | undefined = bruto ? bruto : undefined;

/** Acrescenta o domínio às opções do cookie, quando houver um configurado. */
export function comDominio<T extends object>(options: T): T & { domain?: string } {
  return DOMINIO_COOKIE ? { ...options, domain: DOMINIO_COOKIE } : options;
}
