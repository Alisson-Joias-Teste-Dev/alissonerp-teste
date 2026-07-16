import { describe, it, expect } from "vitest";
import { eventoDaTarefa } from "../evento-da-tarefa";

/**
 * Uma asserção por linha da tabela de
 * docs/regras-negocio/aprovacoes-refatoracao/19-FASE-7-bugs-pos-merge.md (BUG 2,
 * item a). eventoDaTarefa é função PURA — espelha as condições do route.ts sem
 * tocar banco. Qualquer alteração no mapa (ou no route.ts) que quebre estes
 * testes é o sinal de que os dois divergiram.
 */
describe("eventoDaTarefa — mapa tipo/tag → evento (espelha route.ts linha a linha)", () => {
  it("entrega_sem_pagamento: pelo tipo ENTREGA_SEM_PAGAMENTO_TIPO", () => {
    expect(eventoDaTarefa("entrega_sem_pagamento_total", [], {})).toBe("entrega_sem_pagamento");
  });

  it("entrega_sem_pagamento: pela tag legada aprov_entrega_sem_pagamento (tipo diferente)", () => {
    expect(eventoDaTarefa("geral", ["aprov_entrega_sem_pagamento"], {})).toBe("entrega_sem_pagamento");
  });

  it("limpeza_ouro: tipo aprovacao_quebra_metal", () => {
    expect(eventoDaTarefa("aprovacao_quebra_metal", [], {})).toBe("limpeza_ouro");
  });

  it("limpeza_ouro: tipo protocolo_metal (legado) só COM a tag limpeza_ouro:<id>", () => {
    expect(eventoDaTarefa("protocolo_metal", ["limpeza_ouro:123"], {})).toBe("limpeza_ouro");
  });

  it("protocolo_metal SEM a tag limpeza_ouro:* não é limpeza_ouro", () => {
    expect(eventoDaTarefa("protocolo_metal", [], {})).toBeNull();
  });

  it("cartao_desconto: exige venda_id", () => {
    expect(eventoDaTarefa("cartao_desconto", [], { venda_id: 123 })).toBe("cartao_desconto");
  });

  it("cartao_desconto sem venda_id não casa (cai pro resto do mapa)", () => {
    expect(eventoDaTarefa("cartao_desconto", [], { venda_id: null })).toBeNull();
  });

  it("desconto: tipo desconto_acima exige venda_id", () => {
    expect(eventoDaTarefa("desconto_acima", [], { venda_id: 456 })).toBe("desconto");
  });

  it("desconto_acima sem venda_id não casa", () => {
    expect(eventoDaTarefa("desconto_acima", [], { venda_id: undefined })).toBeNull();
  });

  it("crédito real + aprovacao_credito_tipo='diretor' → credito_diretor", () => {
    expect(
      eventoDaTarefa("aprovacao_venda_credito", [], {
        venda_id: 1,
        venda_situacao: "aguardando_aprovacao",
        aprovacao_credito_tipo: "diretor",
      }),
    ).toBe("credito_diretor");
  });

  it("crédito real + aprovacao_credito_tipo diferente de 'diretor' → credito_gerente", () => {
    expect(
      eventoDaTarefa("aprovacao_venda_credito", [], {
        venda_id: 1,
        venda_situacao: "aguardando_aprovacao",
        aprovacao_credito_tipo: "gerente",
      }),
    ).toBe("credito_gerente");
  });

  it("crédito real exclui venda cancelada/entregue/aprovada (não é 'real')", () => {
    expect(
      eventoDaTarefa("aprovacao_venda_credito", [], {
        venda_id: 1,
        venda_situacao: "cancelado",
        aprovacao_credito_tipo: "gerente",
      }),
    ).toBeNull();
  });

  it("crédito real exclui tarefa com tag aprovacao_venda (notificação genérica)", () => {
    expect(
      eventoDaTarefa("aprovacao_venda_credito", ["aprovacao_venda"], {
        venda_id: 1,
        venda_situacao: "aguardando_aprovacao",
        aprovacao_credito_tipo: "gerente",
      }),
    ).toBeNull();
  });

  it("devolucao_estoque: tag devolucao_estoque", () => {
    expect(eventoDaTarefa("geral", ["devolucao_estoque"], {})).toBe("devolucao_estoque");
  });

  it("devolucao: tag devolucao, SEM a tag devolucao_estoque", () => {
    expect(eventoDaTarefa("geral", ["devolucao"], {})).toBe("devolucao");
  });

  it("PRECEDÊNCIA: devolucao_estoque > devolucao — tarefa com as duas tags vira devolucao_estoque", () => {
    expect(eventoDaTarefa("geral", ["devolucao", "devolucao_estoque"], {})).toBe("devolucao_estoque");
  });

  it("compra_comercial: pelo tipo", () => {
    expect(eventoDaTarefa("compra_comercial", [], {})).toBe("compra_comercial");
  });

  it("compra_comercial: pela tag aprovacao_compra_comercial", () => {
    expect(eventoDaTarefa("geral", ["aprovacao_compra_comercial"], {})).toBe("compra_comercial");
  });

  it("recebimento_metal: pelo tipo", () => {
    expect(eventoDaTarefa("recebimento_metal", [], {})).toBe("recebimento_metal");
  });

  it("recebimento_metal: pela tag aprovacao_recebimento_metal", () => {
    expect(eventoDaTarefa("geral", ["aprovacao_recebimento_metal"], {})).toBe("recebimento_metal");
  });

  it("compra_metal: pelo tipo", () => {
    expect(eventoDaTarefa("compra_metal", [], {})).toBe("compra_metal");
  });

  it("compra_metal: pela tag aprovacao_compra_metal", () => {
    expect(eventoDaTarefa("geral", ["aprovacao_compra_metal"], {})).toBe("compra_metal");
  });

  it("tipo 'geral' sem nenhuma tag reconhecida → null (não é aprovação de negócio)", () => {
    expect(eventoDaTarefa("geral", [], {})).toBeNull();
  });

  it("tipo 'sangria' → null", () => {
    expect(eventoDaTarefa("sangria", [], {})).toBeNull();
  });

  it("tipo 'inventario_solicitacao' → null DE PROPÓSITO (evento não modelado no CATALOGO)", () => {
    expect(eventoDaTarefa("inventario_solicitacao", [], {})).toBeNull();
  });

  it("tipo 'conversao' → null (endpoint próprio, não passa por este PATCH)", () => {
    expect(eventoDaTarefa("conversao", [], {})).toBeNull();
  });

  it("tipo 'conversao_sku' → null (endpoint próprio)", () => {
    expect(eventoDaTarefa("conversao_sku", [], {})).toBeNull();
  });

  it("tipo 'conversao_reversa' → null (endpoint próprio)", () => {
    expect(eventoDaTarefa("conversao_reversa", [], {})).toBeNull();
  });

  it("tipo/tags ausentes (undefined/vazio) e sem tarefaInfo → null, sem lançar erro", () => {
    expect(eventoDaTarefa(null, [], null)).toBeNull();
    expect(eventoDaTarefa(undefined, [])).toBeNull();
  });
});
