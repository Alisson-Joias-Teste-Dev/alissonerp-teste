import { describe, it, expect } from "vitest";
import { apagarCookieDeSessaoPresoAoHost } from "@/lib/supabase/cookie-preso-ao-host";

/**
 * Reproduz o estado exato medido na produção em 08/09/2026: a sessão do
 * Supabase partida em `.0`/`.1`, presente DUAS vezes — a versão antiga presa a
 * `erp.alissonjoias.com.br` e a nova em `.alissonjoias.com.br`. Como
 * `document.cookie` não expõe o domínio, as duas aparecem com o mesmo nome.
 */
const COOKIE_DA_PRODUCAO =
  "sb-lqhxntxbgqfxsczaqvcd-auth-token.0=base64-NOVO0; " +
  "sb-lqhxntxbgqfxsczaqvcd-auth-token.1=NOVO1; " +
  "sb-lqhxntxbgqfxsczaqvcd-auth-token.0=base64-VELHO0; " +
  "sb-lqhxntxbgqfxsczaqvcd-auth-token.1=VELHO1; " +
  "outro_cookie=nao_mexer";

function coletar(bruto: string, dominio: string | undefined) {
  const gravadas: string[] = [];
  const nomes = apagarCookieDeSessaoPresoAoHost(bruto, (l) => gravadas.push(l), dominio);
  return { gravadas, nomes };
}

describe("apagarCookieDeSessaoPresoAoHost", () => {
  it("apaga cada pedaço da sessão uma única vez, mesmo duplicado", () => {
    const { gravadas, nomes } = coletar(COOKIE_DA_PRODUCAO, ".alissonjoias.com.br");
    expect(nomes.sort()).toEqual([
      "sb-lqhxntxbgqfxsczaqvcd-auth-token.0",
      "sb-lqhxntxbgqfxsczaqvcd-auth-token.1",
    ]);
    expect(gravadas).toHaveLength(2);
  });

  it("NUNCA manda Domain — é isso que faz apagar só o preso ao host", () => {
    const { gravadas } = coletar(COOKIE_DA_PRODUCAO, ".alissonjoias.com.br");
    for (const linha of gravadas) {
      expect(linha.toLowerCase()).not.toContain("domain");
      expect(linha).toContain("Max-Age=0");
      expect(linha).toContain("Path=/");
    }
  });

  it("não toca em cookie que não é de sessão do Supabase", () => {
    const { nomes } = coletar(COOKIE_DA_PRODUCAO, ".alissonjoias.com.br");
    expect(nomes.join(" ")).not.toContain("outro_cookie");
  });

  it("sem domínio configurado não faz NADA — é o caminho de volta", () => {
    const { gravadas, nomes } = coletar(COOKIE_DA_PRODUCAO, undefined);
    expect(nomes).toEqual([]);
    expect(gravadas).toEqual([]);
    const vazio = coletar(COOKIE_DA_PRODUCAO, "");
    expect(vazio.gravadas).toEqual([]);
  });

  it("pega também a sessão inteira, sem sufixo de pedaço", () => {
    const { nomes } = coletar("sb-abc-auth-token=umtokeninteiro", ".alissonjoias.com.br");
    expect(nomes).toEqual(["sb-abc-auth-token"]);
  });

  it("cookie vazio não quebra", () => {
    expect(coletar("", ".alissonjoias.com.br").nomes).toEqual([]);
  });

  it("não confunde nomes parecidos que não são a sessão", () => {
    const bruto = "sb-abc-auth-token-backup=x; nao-sb-abc-auth-token=y; sb-abc-refresh=z";
    expect(coletar(bruto, ".alissonjoias.com.br").nomes).toEqual([]);
  });
});
