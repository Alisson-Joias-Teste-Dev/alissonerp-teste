/**
 * FASE 2 — Snapshot do CATALOGO.
 * O QUÊ: serializa cada entrada num objeto estável (configKeys/configMulti/
 *   solicitantePodeAprovar) e compara com um objeto esperado EXPLÍCITO (inline, não
 *   toMatchSnapshot de arquivo) — qualquer mudança de política quebra este teste na cara.
 * POR QUÊ: a Fase 3 vai mexer no catálogo pra plugar cada fluxo; este snapshot é o
 *   lembrete mecânico de que qualquer alteração de configKeys/configMulti é uma decisão,
 *   não um acidente.
 * IMPACTO: não plugado em nada; só trava o estado atual do catálogo.
 */
import { describe, it, expect } from "vitest";
import { CATALOGO } from "../catalogo";
import * as autoridade from "../autoridade";
import * as index from "../index";
import type { EventoAprovacao } from "../tipos";

const SNAPSHOT_ESPERADO: Record<
  EventoAprovacao,
  { configKeys: string[]; configMulti?: boolean; solicitantePodeAprovar?: boolean }
> = {
  desconto: { configKeys: ["aprovador_desconto_padrao"], configMulti: true },
  cartao_desconto: { configKeys: ["aprovador_cartao_desconto_padrao"], configMulti: true },
  credito_gerente: { configKeys: ["aprovadora_credito_gerente"], configMulti: true },
  credito_diretor: { configKeys: ["aprovador_credito_diretor"], configMulti: true },
  entrega_sem_pagamento: { configKeys: ["aprovador_entrega_sem_pagamento"], configMulti: true },
  // Fase 3e (12/07): 1 aprovador só — não depende mais de dentro/fora do prazo.
  devolucao: { configKeys: ["aprovador_devolucao"], configMulti: true },
  devolucao_estoque: { configKeys: ["aprovador_devolucao_estoque"], configMulti: true },
  compra_comercial: { configKeys: ["aprovador_compra_comercial"], configMulti: true },
  compra_metal: { configKeys: ["metal_aprovador_id"], configMulti: true },
  recebimento_metal: { configKeys: ["metal_aprovador_id"], configMulti: true },
  conversao: { configKeys: ["aprovador_conversao"], configMulti: true },
  // Fase 3b (12/07): conversao_sku passa a usar a MESMA chave de conversao (decisão do Jonathan).
  conversao_sku: { configKeys: ["aprovador_conversao"], configMulti: true },
  // Feature independente (PR#94, 15/07) plugada nesta camada — tinha fallback pra
  // admin/dev quando a config estava vazia, corrigido pra seguir a mesma política.
  conversao_reversa: { configKeys: ["aprovadores_conversao_reversa"], configMulti: true },
  precificacao: { configKeys: ["aprovador_precificacao"], configMulti: true },
  limpeza_ouro: { configKeys: ["aprovador_limpeza"], configMulti: true },
  devolver_peca: { configKeys: ["aprovadores_devolver_peca"], configMulti: true },
  auditoria: { configKeys: ["aprovador_auditoria"], configMulti: true },
  conferencia_consultora: { configKeys: [], configMulti: false, solicitantePodeAprovar: true },
  alteracao_venda: { configKeys: ["aprovador_alteracao_venda"], configMulti: true },
  // 17/07: garantia depois dos 7 dias úteis da entrega (docs/regras-negocio/ordens.md).
  garantia_fora_prazo: { configKeys: ["aprovadores_garantia_fora_prazo"], configMulti: true },
};

describe("snapshot do CATALOGO — trava a política; qualquer mudança quebra este teste", () => {
  it.each(Object.entries(SNAPSHOT_ESPERADO) as [EventoAprovacao, (typeof SNAPSHOT_ESPERADO)[EventoAprovacao]][])(
    "%s bate com o esperado",
    (evento, esperado) => {
      const regra = CATALOGO[evento];
      expect({
        configKeys: regra.configKeys,
        configMulti: regra.configMulti,
        solicitantePodeAprovar: regra.solicitantePodeAprovar,
      }).toEqual({
        configKeys: esperado.configKeys,
        configMulti: esperado.configMulti,
        solicitantePodeAprovar: esperado.solicitantePodeAprovar,
      });
    },
  );

  it("cobre exatamente os 20 eventos do catálogo, sem sobra nem falta", () => {
    expect(Object.keys(CATALOGO).sort()).toEqual(Object.keys(SNAPSHOT_ESPERADO).sort());
  });

  it("todo evento, EXCETO conferencia_consultora, tem configKeys não-vazio", () => {
    for (const [evento, regra] of Object.entries(CATALOGO)) {
      if (evento === "conferencia_consultora") continue;
      expect(regra.configKeys.length, `${evento} deveria ter configKeys`).toBeGreaterThan(0);
    }
  });

  it("conferencia_consultora: configKeys:[] + solicitantePodeAprovar:true — única exceção do catálogo", () => {
    expect(CATALOGO.conferencia_consultora.configKeys).toEqual([]);
    expect(CATALOGO.conferencia_consultora.solicitantePodeAprovar).toBe(true);
    for (const [evento, regra] of Object.entries(CATALOGO)) {
      if (evento === "conferencia_consultora") continue;
      expect(regra.solicitantePodeAprovar, `${evento} não deveria ter solicitantePodeAprovar`).toBeFalsy();
    }
  });
});

describe("guarda anti-regressão — API antiga (cargo/master/override) não pode voltar", () => {
  it("autoridade.ts não exporta rolesFallback/permiteOverrideAdmin/ACESSO_PLENO/override", () => {
    const api = autoridade as Record<string, unknown>;
    expect(api.ACESSO_PLENO).toBeUndefined();
    expect(api.isAcessoPleno).toBeUndefined();
    expect(api.escolherAprovador).toBeUndefined();
    expect(api.buscarCandidatosPorRole).toBeUndefined();
    expect(api.getMasterAdminId).toBeUndefined();
    expect(api.registrarOverride).toBeUndefined();
  });

  it("nenhuma entrada do catálogo tem campo rolesFallback ou permiteOverrideAdmin", () => {
    for (const regra of Object.values(CATALOGO)) {
      const r = regra as unknown as Record<string, unknown>;
      expect(r.rolesFallback).toBeUndefined();
      expect(r.permiteOverrideAdmin).toBeUndefined();
    }
  });

  it("index.ts não re-exporta a API antiga (registrarOverride, ACESSO_PLENO, escolherAprovador)", () => {
    const api = index as Record<string, unknown>;
    expect(api.registrarOverride).toBeUndefined();
    expect(api.ACESSO_PLENO).toBeUndefined();
    expect(api.escolherAprovador).toBeUndefined();
  });
});
