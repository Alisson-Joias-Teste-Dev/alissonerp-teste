/**
 * FASE 2 — Testes de caracterização ("golden") da política config-first.
 * O QUÊ: table-driven cobrindo os 18 eventos com as funções puras (resolverPorConfig,
 *   avaliarDecisao) — as invariantes comuns da política (config 1 UUID / vários UUIDs /
 *   vazia / solicitante excluído) + os casos especiais (conferencia_consultora, devolucao,
 *   limpeza_ouro).
 * POR QUÊ: congela a política ANTES da Fase 3 migrar qualquer fluxo — se alguém mudar a
 *   política sem querer, um destes testes quebra primeiro.
 * IMPACTO: não plugado em nada; só documenta/trava o comportamento da camada.
 */
import { describe, it, expect } from "vitest";
import { resolverPorConfig, avaliarDecisao } from "../autoridade";
import { CATALOGO } from "../catalogo";
import type { EventoAprovacao } from "../tipos";

/** Os 17 eventos "normais" — todos exceto a exceção conferencia_consultora. */
const EVENTOS_NORMAIS: EventoAprovacao[] = [
  "desconto",
  "cartao_desconto",
  "credito_gerente",
  "credito_diretor",
  "entrega_sem_pagamento",
  "devolucao",
  "devolucao_estoque",
  "compra_comercial",
  "compra_metal",
  "recebimento_metal",
  "conversao",
  "conversao_sku",
  "precificacao",
  "limpeza_ouro",
  "devolver_peca",
  "auditoria",
  "alteracao_venda",
];

describe.each(EVENTOS_NORMAIS)("caracterização config-first — %s", (evento) => {
  const regra = CATALOGO[evento];

  it("config com 1 UUID → ok com esse UUID; esse user pode, outro não", () => {
    const resolucao = resolverPorConfig(regra, ["uuid-aprovador-1"]);
    expect(resolucao).toEqual({ status: "ok", aprovadores: ["uuid-aprovador-1"], origem: "config" });
    const aprovadores = resolucao.status === "ok" ? resolucao.aprovadores : [];
    expect(avaliarDecisao("uuid-aprovador-1", aprovadores)).toEqual({ pode: true });
    expect(avaliarDecisao("uuid-outro", aprovadores).pode).toBe(false);
  });

  it("config com vários UUIDs → aprovadores é a lista inteira; qualquer um da lista pode, fora não", () => {
    const lista = ["uuid-a", "uuid-b", "uuid-c"];
    const resolucao = resolverPorConfig(regra, lista);
    expect(resolucao).toEqual({ status: "ok", aprovadores: lista, origem: "config" });
    for (const id of lista) {
      expect(avaliarDecisao(id, lista)).toEqual({ pode: true });
    }
    expect(avaliarDecisao("uuid-fora-da-lista", lista).pode).toBe(false);
  });

  it("config vazia → 'nao_configurado'; qualquer user não pode decidir", () => {
    const resolucao = resolverPorConfig(regra, []);
    expect(resolucao).toEqual({ status: "nao_configurado", evento, configKeys: regra.configKeys });
    expect(avaliarDecisao("uuid-qualquer", []).pode).toBe(false);
  });

  it("solicitante era o único configurado (já excluído pelo wrapper async) → 'nao_configurado' — ninguém aprova a própria", () => {
    // resolverAprovadores() (I/O) filtra o solicitante da lista ANTES de chamar esta função
    // pura — aqui simulamos o resultado já filtrado (lista vazia porque só havia ele).
    const resolucao = resolverPorConfig(regra, []);
    expect(resolucao.status).toBe("nao_configurado");
  });
});

describe("conferencia_consultora — exceção única da política (auto-aprovação)", () => {
  const regra = CATALOGO.conferencia_consultora;

  it("autoConsultoraId presente (vendedor_id bateu) → origem 'auto_consultora'; essa consultora pode", () => {
    const resolucao = resolverPorConfig(regra, [], "uuid-consultora-dona");
    expect(resolucao).toEqual({ status: "ok", aprovadores: ["uuid-consultora-dona"], origem: "auto_consultora" });
    const aprovadores = resolucao.status === "ok" ? resolucao.aprovadores : [];
    expect(avaliarDecisao("uuid-consultora-dona", aprovadores)).toEqual({ pode: true });
  });

  it("outra consultora (não é a dona da conferência) → pode:false", () => {
    const resolucao = resolverPorConfig(regra, [], "uuid-consultora-dona");
    const aprovadores = resolucao.status === "ok" ? resolucao.aprovadores : [];
    expect(avaliarDecisao("uuid-outra-consultora", aprovadores).pode).toBe(false);
  });

  it("sem consultora batendo (vendedor_id não confere) → 'nao_configurado'/pode:false", () => {
    const resolucao = resolverPorConfig(regra, []);
    expect(resolucao.status).toBe("nao_configurado");
    expect(avaliarDecisao("uuid-qualquer", []).pode).toBe(false);
  });

  it("configKeys vazio — não há aprovador a configurar pra este evento (única exceção do catálogo)", () => {
    expect(regra.configKeys).toEqual([]);
  });
});

describe("devolucao — a configKey efetiva depende de ctx.foraPrazo", () => {
  it("catálogo lista as 2 chaves, dentro-do-prazo ('aprovadora_credito_gerente') primeiro", () => {
    expect(CATALOGO.devolucao.configKeys[0]).toBe("aprovadora_credito_gerente");
  });
  it("2ª chave é a de fora do prazo ('aprovador_devolucao_fora_prazo')", () => {
    expect(CATALOGO.devolucao.configKeys[1]).toBe("aprovador_devolucao_fora_prazo");
  });
  // A seleção em si (qual chave é lida, dado ctx.foraPrazo) acontece em `configKeysEfetivas`,
  // função interna (I/O) de resolverAprovadores() — não exportada, não pura. É replicação
  // fiel de src/lib/devolucoes.ts:280-286 (documentado no catálogo). Exercida na Fase 3,
  // via integração contra homolog (dois cenários: dentro e fora do prazo).
});

describe("limpeza_ouro — a regra rígida de sempre virou a regra geral (sem override, só o UUID)", () => {
  it("comportamento idêntico aos demais eventos agora: config vazia = nao_configurado, sem fallback nenhum", () => {
    const regra = CATALOGO.limpeza_ouro;
    expect(resolverPorConfig(regra, []).status).toBe("nao_configurado");
    expect(resolverPorConfig(regra, ["uuid-aprovador-limpeza"])).toEqual({
      status: "ok",
      aprovadores: ["uuid-aprovador-limpeza"],
      origem: "config",
    });
  });
});
