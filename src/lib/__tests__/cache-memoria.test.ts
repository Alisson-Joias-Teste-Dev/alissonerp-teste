/**
 * Teste do cache em memoria — src/lib/cache-memoria.ts
 *
 * POR QUE EXISTE: este cache fica no caminho de TODA requisicao do ERP
 * (requireAuth + temAcessoModulo). Um bug aqui nao aparece como erro: aparece
 * como usuario vendo permissao errada, ou como funcionario desativado
 * continuando logado. Este teste congela o contrato: expira no prazo,
 * invalida quando mandam invalidar, e nao cresce sem limite.
 *
 * IMPACTO SE REMOVIDO: uma mudanca futura no TTL ou no despejo por tamanho
 * poderia vazar permissao velha sem nada travar.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  cacheGet,
  cacheSet,
  cacheInvalidar,
  cacheInvalidarPrefixo,
  cacheLimparTudo,
  cacheTamanho,
} from "@/lib/cache-memoria";

const TTL = 60_000;

beforeEach(() => {
  cacheLimparTudo();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheGet / cacheSet", () => {
  it("devolve undefined para chave que nunca foi gravada", () => {
    expect(cacheGet("nao-existe", TTL)).toBeUndefined();
  });

  it("devolve o valor gravado dentro da validade", () => {
    cacheSet("auth:abc", { role: "vendedor", ativo: true });
    expect(cacheGet("auth:abc", TTL)).toEqual({ role: "vendedor", ativo: true });
  });

  it("guarda false sem confundir com 'nao encontrado'", () => {
    // REGRA: temPermissao cacheia booleano. Se `false` virasse undefined,
    // toda negativa iria ao banco de novo — o cache perderia metade do ganho.
    cacheSet("perm:u1:abrir_ligacao", false);
    expect(cacheGet<boolean>("perm:u1:abrir_ligacao", TTL)).toBe(false);
  });

  it("guarda null sem confundir com 'nao encontrado'", () => {
    // REGRA: temAcessoModulo cacheia `null` quando nao existe linha em
    // role_permissoes. Precisa sobreviver ao cache, senao consulta sempre.
    cacheSet("mod:vendedor:financeiro", null);
    expect(cacheGet("mod:vendedor:financeiro", TTL)).toBeNull();
  });
});

describe("validade (TTL)", () => {
  it("expira exatamente ao completar o TTL", () => {
    vi.useFakeTimers();
    cacheSet("auth:abc", { role: "admin" });

    vi.advanceTimersByTime(TTL - 1);
    expect(cacheGet("auth:abc", TTL)).toEqual({ role: "admin" });

    vi.advanceTimersByTime(1);
    expect(cacheGet("auth:abc", TTL)).toBeUndefined();
  });

  it("remove a entrada vencida da memoria ao ler (limpeza preguicosa)", () => {
    vi.useFakeTimers();
    cacheSet("auth:abc", 1);
    expect(cacheTamanho()).toBe(1);

    vi.advanceTimersByTime(TTL);
    cacheGet("auth:abc", TTL);
    expect(cacheTamanho()).toBe(0);
  });

  it("regravar reinicia a contagem do TTL", () => {
    vi.useFakeTimers();
    cacheSet("auth:abc", 1);

    vi.advanceTimersByTime(TTL - 10);
    cacheSet("auth:abc", 2);

    vi.advanceTimersByTime(TTL - 10);
    expect(cacheGet("auth:abc", TTL)).toBe(2);
  });
});

describe("invalidacao", () => {
  it("cacheInvalidar remove so a chave pedida", () => {
    cacheSet("auth:u1", "a");
    cacheSet("auth:u2", "b");

    cacheInvalidar("auth:u1");

    expect(cacheGet("auth:u1", TTL)).toBeUndefined();
    expect(cacheGet("auth:u2", TTL)).toBe("b");
  });

  it("cacheInvalidarPrefixo limpa todas as acoes de um usuario e poupa os outros", () => {
    // Cenario real: admin salva permissoes de u1 no painel.
    cacheSet("perm:u1:abrir_ligacao", true);
    cacheSet("perm:u1:concluir_ligacao", true);
    cacheSet("perm:u2:abrir_ligacao", true);

    cacheInvalidarPrefixo("perm:u1:");

    expect(cacheGet("perm:u1:abrir_ligacao", TTL)).toBeUndefined();
    expect(cacheGet("perm:u1:concluir_ligacao", TTL)).toBeUndefined();
    expect(cacheGet("perm:u2:abrir_ligacao", TTL)).toBe(true);
  });

  it("cacheInvalidarPrefixo por cargo nao afeta cargo de nome parecido a mais", () => {
    // "mod:vendedor:" nao pode derrubar "mod:vendedor_junior:"? Pode nao — o
    // separador ':' garante fronteira. Este teste congela isso.
    cacheSet("mod:vendedor:vendas", true);
    cacheSet("mod:vendedor_junior:vendas", true);

    cacheInvalidarPrefixo("mod:vendedor:");

    expect(cacheGet("mod:vendedor:vendas", TTL)).toBeUndefined();
    expect(cacheGet("mod:vendedor_junior:vendas", TTL)).toBe(true);
  });
});

describe("limite de memoria", () => {
  it("nao passa do teto de entradas, descartando as mais antigas", () => {
    for (let i = 0; i < 5_200; i++) cacheSet(`k${i}`, i);

    expect(cacheTamanho()).toBeLessThanOrEqual(5_000);
    // a mais recente sobrevive; a mais antiga foi descartada
    expect(cacheGet("k5199", TTL)).toBe(5199);
    expect(cacheGet("k0", TTL)).toBeUndefined();
  });
});
