import { describe, it, expect } from "vitest";
import { resolverPorConfig, avaliarDecisao } from "../autoridade";
import * as autoridade from "../autoridade";
import * as index from "../index";
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
  "conversao_reversa",
  "precificacao",
  "limpeza_ouro",
  "devolver_peca",
  "auditoria",
  "conferencia_consultora",
  "alteracao_venda",
  "garantia_fora_prazo",
];

describe("resolverPorConfig", () => {
  it("1 UUID configurado → status 'ok' com esse UUID (origem 'config')", () => {
    const regra = CATALOGO.desconto;
    const resultado = resolverPorConfig(regra, ["uuid-config-1"]);
    expect(resultado).toEqual({ status: "ok", aprovadores: ["uuid-config-1"], origem: "config" });
  });

  it("vários UUIDs configurados → status 'ok' com a lista inteira", () => {
    const regra = CATALOGO.devolver_peca;
    const resultado = resolverPorConfig(regra, ["uuid-a", "uuid-b", "uuid-c"]);
    expect(resultado).toEqual({ status: "ok", aprovadores: ["uuid-a", "uuid-b", "uuid-c"], origem: "config" });
  });

  it("config vazia → status 'nao_configurado' com o evento e as configKeys (não escolhe ninguém sozinha)", () => {
    const regra = CATALOGO.desconto;
    const resultado = resolverPorConfig(regra, []);
    expect(resultado).toEqual({
      status: "nao_configurado",
      evento: "desconto",
      configKeys: ["aprovador_desconto_padrao"],
    });
  });

  it("solicitante era o único configurado, já excluído pelo wrapper async → 'nao_configurado' (ninguém aprova a própria)", () => {
    const regra = CATALOGO.compra_comercial;
    // resolverAprovadores() filtra o solicitante ANTES de chamar esta função pura.
    const resultado = resolverPorConfig(regra, []);
    expect(resultado.status).toBe("nao_configurado");
  });

  it("conferencia_consultora com autoConsultoraId → status 'ok', origem 'auto_consultora'", () => {
    const regra = CATALOGO.conferencia_consultora;
    const resultado = resolverPorConfig(regra, [], "uuid-consultora");
    expect(resultado).toEqual({ status: "ok", aprovadores: ["uuid-consultora"], origem: "auto_consultora" });
  });

  it("conferencia_consultora sem autoConsultoraId (vendedor_id não bateu) → 'nao_configurado'", () => {
    const regra = CATALOGO.conferencia_consultora;
    const resultado = resolverPorConfig(regra, []);
    expect(resultado.status).toBe("nao_configurado");
  });
});

describe("avaliarDecisao", () => {
  it("user está na lista de aprovadores → {pode:true}", () => {
    expect(avaliarDecisao("uuid-aprovador", ["uuid-aprovador", "uuid-outro"])).toEqual({ pode: true });
  });

  it("user NÃO está na lista (mesmo sendo admin) → {pode:false} — sem override, ninguém decide fora da lista", () => {
    expect(avaliarDecisao("uuid-admin-fora-da-lista", ["uuid-aprovador"])).toEqual({
      pode: false,
      motivo: "nao_e_aprovador_configurado",
    });
  });

  it("lista vazia (equivalente ao 'nao_configurado' já filtrado) → {pode:false} pra qualquer user", () => {
    expect(avaliarDecisao("uuid-qualquer", []).pode).toBe(false);
  });

  it("conferencia_consultora: a consultora dona da conferência → {pode:true}; outra consultora → {pode:false}", () => {
    const aprovadores = ["uuid-consultora-dona"];
    expect(avaliarDecisao("uuid-consultora-dona", aprovadores)).toEqual({ pode: true });
    expect(avaliarDecisao("uuid-outra-consultora", aprovadores).pode).toBe(false);
  });
});

describe("devolucao — Fase 3e: 1 aprovador só, sem distinção de prazo", () => {
  it("catálogo tem 1 chave só (aprovador_devolucao) — prazo não influencia mais quem aprova", () => {
    expect(CATALOGO.devolucao.configKeys).toEqual(["aprovador_devolucao"]);
  });
});

describe("4 chaves de config ainda NÃO plugadas (criadas via /dba quando cada fluxo migrar)", () => {
  it.each([
    ["alteracao_venda", "aprovador_alteracao_venda"],
    ["precificacao", "aprovador_precificacao"],
    ["auditoria", "aprovador_auditoria"],
  ] as const)("%s usa a chave '%s'", (evento, chave) => {
    expect(CATALOGO[evento].configKeys).toEqual([chave]);
  });
});

describe("conversao / conversao_sku — Fase 3b: mesma chave (aprovador_conversao)", () => {
  it("conversao usa aprovador_conversao", () => {
    expect(CATALOGO.conversao.configKeys).toEqual(["aprovador_conversao"]);
  });
  it("conversao_sku usa a MESMA chave que conversao (decisão do Jonathan, 12/07)", () => {
    expect(CATALOGO.conversao_sku.configKeys).toEqual(["aprovador_conversao"]);
  });
});

describe("CATALOGO — completude e consistência (política config-first estrita)", () => {
  it("tem exatamente uma entrada por EventoAprovacao, sem sobras nem faltas", () => {
    const chavesDoCatalogo = Object.keys(CATALOGO).sort();
    expect(chavesDoCatalogo).toEqual([...TODOS_EVENTOS].sort());
  });

  it("evento e a chave do CATALOGO são consistentes", () => {
    for (const evento of TODOS_EVENTOS) {
      expect(CATALOGO[evento].evento).toBe(evento);
    }
  });

  it("todo evento, EXCETO conferencia_consultora, tem configKeys não-vazio e configMulti:true", () => {
    for (const evento of TODOS_EVENTOS) {
      if (evento === "conferencia_consultora") continue;
      const regra = CATALOGO[evento];
      expect(regra.configKeys.length).toBeGreaterThan(0);
      expect(regra.configMulti).toBe(true);
    }
  });

  it("conferencia_consultora é a ÚNICA exceção: configKeys vazio + solicitantePodeAprovar:true", () => {
    const regra = CATALOGO.conferencia_consultora;
    expect(regra.configKeys).toEqual([]);
    expect(regra.solicitantePodeAprovar).toBe(true);
    for (const evento of TODOS_EVENTOS) {
      if (evento === "conferencia_consultora") continue;
      expect(CATALOGO[evento].solicitantePodeAprovar).toBeFalsy();
    }
  });
});

describe("guarda anti-regressão — política antiga (cargo/master/override) não pode voltar", () => {
  it("autoridade.ts não exporta mais nada de cargo/master/override de admin", () => {
    const api = autoridade as Record<string, unknown>;
    expect(api.ACESSO_PLENO).toBeUndefined();
    expect(api.isAcessoPleno).toBeUndefined();
    expect(api.escolherAprovador).toBeUndefined();
    expect(api.buscarCandidatosPorRole).toBeUndefined();
    expect(api.getMasterAdminId).toBeUndefined();
    expect(api.registrarOverride).toBeUndefined();
  });

  it("index.ts não re-exporta a API antiga (registrarOverride, AlvoOverride, ACESSO_PLENO)", () => {
    const api = index as Record<string, unknown>;
    expect(api.registrarOverride).toBeUndefined();
    expect(api.ACESSO_PLENO).toBeUndefined();
    expect(api.escolherAprovador).toBeUndefined();
  });

  it("podeDecidir tem a assinatura nova (2-3 args: user, evento, ctx?) — sem o 'tarefa' antigo", () => {
    // função pura de 3 args nominais (user, evento, ctx?) — o antigo tinha 4 (user, evento, tarefa, ctx?)
    expect(autoridade.podeDecidir.length).toBeLessThanOrEqual(3);
  });
});
