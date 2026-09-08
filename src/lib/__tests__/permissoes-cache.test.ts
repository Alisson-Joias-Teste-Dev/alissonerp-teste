/**
 * Teste do CACHE de permissoes — src/lib/permissoes.ts
 *
 * POR QUE EXISTE: `temAcessoModulo` e chamada em 43 rotas e `temPermissao` no
 * requirePermissao. Elas passaram a cachear por 60s para aliviar o pool de
 * conexoes do banco. Este teste congela as duas metades do contrato:
 *   1) a 2a chamada NAO vai ao banco (senao o ganho de performance nao existe);
 *   2) depois de invalidar, a proxima chamada VAI ao banco (senao o painel de
 *      permissoes fica "sem efeito" por ate 60s, que parece bug grave).
 *
 * IMPACTO SE REMOVIDO: alguem pode quebrar o cache (sempre consultando) ou a
 * invalidacao (nunca atualizando) sem nada travar no CI.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock do banco: `sql` e usada como tagged template -> sql`SELECT ...`
const linhas: unknown[] = [];
const sqlMock = vi.fn(() => Promise.resolve(linhas));

vi.mock("@/lib/db", () => ({
  default: (...args: unknown[]) => sqlMock(...(args as [])),
}));

import {
  temAcessoModulo,
  temPermissao,
  invalidarCachePermissoesRole,
  invalidarCachePermissoesUsuario,
} from "@/lib/permissoes";
import { cacheLimparTudo } from "@/lib/cache-memoria";

beforeEach(() => {
  cacheLimparTudo();
  sqlMock.mockClear();
  linhas.length = 0;
});

describe("temAcessoModulo", () => {
  it("admin/desenvolvedor/diretor nem chegam a consultar o banco", async () => {
    // fullAccess e atalho ANTES do cache — comportamento antigo, preservado.
    expect(await temAcessoModulo("admin", "financeiro")).toBe(true);
    expect(await temAcessoModulo("desenvolvedor", "financeiro")).toBe(true);
    expect(await temAcessoModulo("diretor", "financeiro")).toBe(true);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("consulta o banco na 1a chamada e usa o cache na 2a", async () => {
    linhas.push({ pode_ler: true, pode_escrever: false });

    expect(await temAcessoModulo("vendedor", "vendas")).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(1);

    expect(await temAcessoModulo("vendedor", "vendas")).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(1); // NAO consultou de novo
  });

  it("cacheia por (role, modulo): modulo diferente consulta de novo", async () => {
    linhas.push({ pode_ler: true, pode_escrever: true });

    await temAcessoModulo("vendedor", "vendas");
    await temAcessoModulo("vendedor", "financeiro");

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("uma consulta serve para ler E escrever (nao duplica ida ao banco)", async () => {
    linhas.push({ pode_ler: true, pode_escrever: false });

    expect(await temAcessoModulo("vendedor", "vendas", "ler")).toBe(true);
    expect(await temAcessoModulo("vendedor", "vendas", "escrever")).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("cacheia tambem a AUSENCIA de linha (cargo sem acesso configurado)", async () => {
    // linhas vazio => row undefined => null cacheado.
    expect(await temAcessoModulo("motoboy", "financeiro")).toBe(false);
    expect(await temAcessoModulo("motoboy", "financeiro")).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("apos invalidarCachePermissoesRole, volta a consultar o banco", async () => {
    linhas.push({ pode_ler: false, pode_escrever: false });
    expect(await temAcessoModulo("vendedor", "vendas")).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);

    // admin liberou o modulo no painel
    invalidarCachePermissoesRole("vendedor");
    linhas.length = 0;
    linhas.push({ pode_ler: true, pode_escrever: true });

    expect(await temAcessoModulo("vendedor", "vendas")).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("invalidar um cargo nao derruba o cache de outro", async () => {
    linhas.push({ pode_ler: true, pode_escrever: true });
    await temAcessoModulo("vendedor", "vendas");
    await temAcessoModulo("motoboy", "vendas");
    expect(sqlMock).toHaveBeenCalledTimes(2);

    invalidarCachePermissoesRole("vendedor");

    await temAcessoModulo("motoboy", "vendas");
    expect(sqlMock).toHaveBeenCalledTimes(2); // motoboy seguiu em cache
  });
});

describe("temPermissao", () => {
  it("fullAccess passa sem consultar o banco", async () => {
    expect(await temPermissao("u1", "abrir_ligacao", "admin")).toBe(true);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("consulta na 1a chamada e usa cache na 2a", async () => {
    linhas.push({ permitido: true });

    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(true);
    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("cacheia a negativa (false) sem reconsultar", async () => {
    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(false);
    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("apos invalidarCachePermissoesUsuario, volta a consultar", async () => {
    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(false);
    expect(sqlMock).toHaveBeenCalledTimes(1);

    invalidarCachePermissoesUsuario("u1");
    linhas.push({ permitido: true });

    expect(await temPermissao("u1", "abrir_ligacao", "ourives")).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("invalidar um usuario nao derruba o cache de outro", async () => {
    linhas.push({ permitido: true });
    await temPermissao("u1", "abrir_ligacao", "ourives");
    await temPermissao("u2", "abrir_ligacao", "ourives");
    expect(sqlMock).toHaveBeenCalledTimes(2);

    invalidarCachePermissoesUsuario("u1");

    await temPermissao("u2", "abrir_ligacao", "ourives");
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
