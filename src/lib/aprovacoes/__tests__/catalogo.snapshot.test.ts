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
  // Migração do frete-avulso-solicitacao (migration 353) pra camada central —
  // substitui o pool na unha (isPoolFreteAvulso/listarAprovadoresFreteAvulso).
  // Migration 359 (21/07): "quem paga" — frete_avulso cobre só pagante='cliente'.
  frete_avulso: { configKeys: ["aprovadores_frete_avulso"], configMulti: true },
  // Migration 359 (21/07): irmão de frete_avulso pra pagante='loja' — chave
  // própria (aprovadores_frete_avulso_loja), autoriza o CUSTO da loja.
  // 31/07 (decisão do Jonathan): quem está nessa lista é o responsável pelos
  // fretes da loja e PODE aprovar a própria solicitação (solicitantePodeAprovar).
  frete_avulso_loja: { configKeys: ["aprovadores_frete_avulso_loja"], configMulti: true, solicitantePodeAprovar: true },
  // BLOCO 4 (21/07): rotina automática do dia 01 — fechamento mensal do saldo
  // de frete grátis. Saldo negativo cria esta tarefa (src/lib/frete-fechamento.ts).
  fechamento_frete_negativo: { configKeys: ["aprovadores_fechamento_frete"], configMulti: true },
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

  it("cobre exatamente os 23 eventos do catálogo, sem sobra nem falta", () => {
    expect(Object.keys(CATALOGO).sort()).toEqual(Object.keys(SNAPSHOT_ESPERADO).sort());
  });

  it("todo evento, EXCETO conferencia_consultora, tem configKeys não-vazio", () => {
    for (const [evento, regra] of Object.entries(CATALOGO)) {
      if (evento === "conferencia_consultora") continue;
      expect(regra.configKeys.length, `${evento} deveria ter configKeys`).toBeGreaterThan(0);
    }
  });

  it("solicitantePodeAprovar: só conferencia_consultora e frete_avulso_loja (31/07) — nenhum outro evento", () => {
    // conferencia_consultora: sem aprovador a configurar — a consultora aprova a própria conferência.
    expect(CATALOGO.conferencia_consultora.configKeys).toEqual([]);
    expect(CATALOGO.conferencia_consultora.solicitantePodeAprovar).toBe(true);
    // frete_avulso_loja (31/07, decisão do Jonathan): o responsável configurado
    // no pool pode aprovar o próprio frete pago pela loja. O irmão frete_avulso
    // (pagante='cliente') mantém a segregação de função.
    expect(CATALOGO.frete_avulso_loja.solicitantePodeAprovar).toBe(true);
    expect(CATALOGO.frete_avulso.solicitantePodeAprovar).toBeFalsy();
    const excecoes = new Set(["conferencia_consultora", "frete_avulso_loja"]);
    for (const [evento, regra] of Object.entries(CATALOGO)) {
      if (excecoes.has(evento)) continue;
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
