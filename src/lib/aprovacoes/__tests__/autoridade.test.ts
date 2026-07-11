import { describe, it, expect } from "vitest";
import { escolherAprovador, avaliarDecisao, ACESSO_PLENO } from "../autoridade";
import { CATALOGO } from "../catalogo";
import type { EventoAprovacao } from "../tipos";

const TODOS_EVENTOS: EventoAprovacao[] = [
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
  "conferencia_consultora",
  "alteracao_venda",
];

describe("escolherAprovador", () => {
  it("config presente → retorna o UUID da config (origem 'config')", () => {
    const regra = CATALOGO.desconto;
    const resultado = escolherAprovador(regra, ["uuid-config-1"], ["uuid-role-1"], "uuid-solicitante");
    expect(resultado).toEqual({ aprovadorId: "uuid-config-1", origem: "config" });
  });

  it("config vazia → cai no fallback por role, excluindo o solicitante (origem 'role_fallback')", () => {
    const regra = CATALOGO.desconto;
    const resultado = escolherAprovador(regra, [], ["uuid-solicitante", "uuid-role-2"], "uuid-solicitante");
    expect(resultado).toEqual({ aprovadorId: "uuid-role-2", origem: "role_fallback" });
  });

  it("sem candidato nenhum → null (o wrapper async resolverAprovador cai pro master)", () => {
    const regra = CATALOGO.desconto;
    const resultado = escolherAprovador(regra, [], [], "uuid-solicitante");
    expect(resultado).toBeNull();
  });

  it("solicitante é o único candidato e regra NÃO permite auto-aprovação → null", () => {
    const regra = CATALOGO.desconto; // solicitantePodeAprovar não está setado
    const resultado = escolherAprovador(regra, [], ["uuid-solicitante"], "uuid-solicitante");
    expect(resultado).toBeNull();
  });

  it("conferencia_consultora permite o solicitante como candidato (solicitantePodeAprovar:true)", () => {
    const regra = CATALOGO.conferencia_consultora;
    const resultado = escolherAprovador(regra, [], ["uuid-solicitante"], "uuid-solicitante");
    expect(resultado).toEqual({ aprovadorId: "uuid-solicitante", origem: "role_fallback" });
  });
});

describe("avaliarDecisao", () => {
  it("user é o aprovador designado → {pode:true, viaOverride:false}", () => {
    const regra = CATALOGO.desconto;
    const resultado = avaliarDecisao("consultora", "uuid-user", regra, "uuid-user");
    expect(resultado).toEqual({ pode: true, viaOverride: false });
  });

  it("admin ≠ designado, com permiteOverrideAdmin:true → {pode:true, viaOverride:true}", () => {
    const regra = CATALOGO.desconto;
    expect(regra.permiteOverrideAdmin).toBe(true);
    const resultado = avaliarDecisao("admin", "uuid-admin", regra, "uuid-outro-usuario");
    expect(resultado.pode).toBe(true);
    expect(resultado.viaOverride).toBe(true);
  });

  it("limpeza_ouro (permiteOverrideAdmin:false): admin ≠ UUID configurado → {pode:false}", () => {
    const regra = CATALOGO.limpeza_ouro;
    expect(regra.permiteOverrideAdmin).toBe(false);
    const resultado = avaliarDecisao("admin", "uuid-admin", regra, "uuid-do-aprovador-limpeza");
    expect(resultado.pode).toBe(false);
  });

  it("conferencia_consultora: ctx.consultoraVendedorId batendo o solicitante → {pode:true}", () => {
    const regra = CATALOGO.conferencia_consultora;
    // aprovadorDesignado já resolvido = a própria consultora (resolverAprovador
    // validou vendedor_id === consultoraVendedorId antes de chegar aqui).
    const resultado = avaliarDecisao(
      "consultora",
      "uuid-consultora",
      regra,
      "uuid-consultora",
      { solicitanteId: "uuid-consultora", consultoraVendedorId: 42 },
    );
    expect(resultado).toEqual({ pode: true, viaOverride: false });
  });

  it("sem aprovador designado, role fora do fallback e sem override → {pode:false}", () => {
    const regra = CATALOGO.limpeza_ouro; // rolesFallback: [] e sem override
    const resultado = avaliarDecisao("gerente_loja", "uuid-gerente", regra, null);
    expect(resultado.pode).toBe(false);
  });

  it("sem aprovador designado, role no fallback → {pode:true, viaOverride:false}", () => {
    const regra = CATALOGO.compra_metal;
    const resultado = avaliarDecisao("gerente_fabrica", "uuid-gerente", regra, null);
    expect(resultado).toEqual({ pode: true, viaOverride: false });
  });
});

describe("CATALOGO — completude e consistência", () => {
  it("tem exatamente uma entrada por EventoAprovacao, sem sobras nem faltas", () => {
    const chavesDoCatalogo = Object.keys(CATALOGO).sort();
    expect(chavesDoCatalogo).toEqual([...TODOS_EVENTOS].sort());
  });

  it("evento e a chave do CATALOGO são consistentes", () => {
    for (const evento of TODOS_EVENTOS) {
      expect(CATALOGO[evento].evento).toBe(evento);
    }
  });

  it("todo evento tem rolesFallback válido (array de strings não-vazias)", () => {
    for (const evento of TODOS_EVENTOS) {
      const regra = CATALOGO[evento];
      expect(Array.isArray(regra.rolesFallback)).toBe(true);
      for (const role of regra.rolesFallback) {
        expect(typeof role).toBe("string");
        expect(role.length).toBeGreaterThan(0);
      }
    }
  });

  it("rolesFallback vazio só é aceitável quando o evento NÃO permite override do admin", () => {
    for (const evento of TODOS_EVENTOS) {
      const regra = CATALOGO[evento];
      if (regra.rolesFallback.length === 0) {
        expect(regra.permiteOverrideAdmin).toBe(false);
      }
    }
  });

  it("ACESSO_PLENO é a única lista de acesso total (admin, desenvolvedor, diretor)", () => {
    expect(ACESSO_PLENO).toEqual(["admin", "desenvolvedor", "diretor"]);
  });
});
