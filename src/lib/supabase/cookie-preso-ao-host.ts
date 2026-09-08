import { DOMINIO_COOKIE } from "./cookie-dominio";

/**
 * Apaga o cookie de sessão do Supabase que ficou PRESO AO HOST, antes de um
 * login novo gravar a versão no domínio-pai.
 *
 * 🔴 BUG REAL, MEDIDO NA PRODUÇÃO em 08/09/2026, logo depois de ligar o
 * `NEXT_PUBLIC_COOKIE_DOMAIN`: quem já tinha sessão aberta e entrou de novo
 * ficou com DOIS cookies de mesmo nome — o antigo em `erp.alissonjoias.com.br`
 * (preso ao host) e o novo em `.alissonjoias.com.br`. O navegador manda os
 * dois, e como a sessão é grande o `@supabase/ssr` a parte em `...-auth-token.0`
 * e `.1`; ao remontar, ele pode juntar um pedaço NOVO com um pedaço VELHO. O
 * token sai corrompido e o GoTrue responde 403 em `/auth/v1/user`. O sintoma na
 * tela foi o MENU INTEIRO SUMIR (ele nasce das permissões, e a chamada voltava
 * 401) — não parecia problema de cookie nenhum. Limpar os cookies do site e
 * entrar de novo resolvia; foi assim que a causa ficou provada.
 *
 * O JavaScript não consegue LER o domínio de um cookie (`document.cookie` só
 * devolve nome=valor). Mas consegue APAGAR o preso ao host: gravando o mesmo
 * nome expirado SEM o atributo `Domain`, o navegador casa só com o host-only e
 * deixa o de `.alissonjoias.com.br` intacto.
 *
 * 🔴 CHAMAR ANTES DO LOGIN, não depois. Antes, o pior caso é apagar uma sessão
 * que o login seguinte recria. Depois, se por qualquer motivo a versão com
 * domínio não tiver sido gravada, a pessoa ficaria sem cookie nenhum —
 * deslogada na hora. A ordem escolhida erra para o lado seguro.
 *
 * Sem `DOMINIO_COOKIE` configurado não há duplicata possível e a função não faz
 * nada — mesmo caminho de volta do resto do estrangulamento.
 */

/** `sb-<ref>-auth-token`, com ou sem o sufixo de pedaço (`.0`, `.1`, …). */
const NOME_DE_SESSAO = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * @param cookieBruto conteúdo de `document.cookie`
 * @param gravar recebe cada linha de `Set-Cookie` a atribuir em `document.cookie`
 * @param dominio domínio configurado (`DOMINIO_COOKIE`); vazio = não faz nada
 * @returns nomes que foram apagados, para log/teste
 */
export function apagarCookieDeSessaoPresoAoHost(
  cookieBruto: string,
  gravar: (linha: string) => void,
  dominio: string | undefined,
): string[] {
  if (!dominio) return [];

  const nomes = new Set<string>();
  for (const parte of cookieBruto.split(";")) {
    const nome = parte.split("=")[0]?.trim();
    if (nome && NOME_DE_SESSAO.test(nome)) nomes.add(nome);
  }

  for (const nome of nomes) {
    // Sem `Domain=` de propósito: é isso que faz o navegador casar apenas com
    // o cookie preso ao host, preservando o do domínio-pai.
    gravar(`${nome}=; Path=/; Max-Age=0; SameSite=Lax`);
  }
  return [...nomes];
}

/** Atalho para uso no navegador. Fora dele, não faz nada. */
export function apagarCookieDeSessaoPresoAoHostNoNavegador(): string[] {
  if (typeof document === "undefined") return [];
  return apagarCookieDeSessaoPresoAoHost(
    document.cookie,
    (linha) => {
      document.cookie = linha;
    },
    DOMINIO_COOKIE,
  );
}
