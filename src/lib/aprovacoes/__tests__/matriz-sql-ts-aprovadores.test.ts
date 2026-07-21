import { describe, it, expect } from "vitest";
import { eventoDaTarefa, type TarefaInfoParaEvento } from "../evento-da-tarefa";

/**
 * TESTE DE SIMETRIA SQL ↔ TS (20/07 — pós-revisão do fix "2º/3º aprovador
 * configurado passa a ver a tarefa e os botões", commit 5fac3e5c).
 *
 * O QUÊ: congela a correspondência entre os DOIS lados que decidem "quem pode
 *   decidir uma tarefa multi-aprovador":
 *     - o SQL `multiAprovadorCond` (src/app/api/tarefas/route.ts, ~L84-166) —
 *       calcula `pode_decidir` na LISTAGEM/detalhe (o que faz o botão aparecer
 *       na tela);
 *     - o mapa `eventoDaTarefa` (src/lib/aprovacoes/evento-da-tarefa.ts) — usado
 *       pelo portão genérico do PATCH .../aprovacao, a autoridade REAL que
 *       decide se o clique é aceito ou vira 403.
 *   Pra cada tipo/tag que o SQL reconhece como multi-aprovador configurado,
 *   este teste afirma que eventoDaTarefa devolve um evento NÃO-NULO — ou seja,
 *   se o SQL manda mostrar o botão, o TS concorda que ali existe um evento de
 *   negócio (o `podeDecidir` final, que roda com a config viva no PATCH, ainda
 *   pode negar por outro motivo — isso é autoridade, não é o que este teste
 *   cobre).
 *
 * POR QUÊ: os dois lados são mantidos por mãos separadas (o SQL cresce no
 *   route.ts, o TS cresce no evento-da-tarefa.ts) e não há nada no compilador
 *   que force os dois a concordar. Foi exatamente essa divergência silenciosa
 *   que gerou o BUG corrigido no commit 5fac3e5c (SQL/PATCH já autorizavam o
 *   2º/3º aprovador, a UI não sabia) e é o mesmo tipo de divergência que o
 *   comentário "ASSIMETRIA CONHECIDA" da cláusula credito_loja em
 *   multiAprovadorCond documenta na direção contrária (SQL libera, TS nega).
 *
 * IMPACTO SE REMOVIDO/RELAXADO: a divergência entre os dois lados volta a
 *   passar silenciosa — nenhum teste quebra quando alguém edita só um dos
 *   arquivos (adiciona um tipo novo só no SQL, ou remove um `if` só do TS).
 *   O sistema só descobre em produção, pelo usuário que vê o botão e toma 403
 *   (ou pelo usuário que deveria ver o botão e não vê).
 *
 * 3 EXCEÇÕES CONHECIDAS (documentadas de propósito — NÃO são bug):
 *   1. conversao / conversao_sku / conversao_reversa — eventoDaTarefa devolve
 *      null DE PROPÓSITO: esses três são endpoints próprios que NUNCA criam
 *      linha em alissonerp.aprovacoes_tarefa — o botão (que só existe por
 *      linha de aprovacoes_tarefa) nunca renderiza pra eles. Mapear um evento
 *      aqui seria inerte (ver comentário no topo de evento-da-tarefa.ts).
 *   2. credito_loja (credito_gerente/credito_diretor) — depende do ESTADO da
 *      venda (venda ATIVA + aprovacao_credito_tipo preenchido). Testado aqui
 *      com uma venda ativa válida → evento não-nulo (regra geral). O caso de
 *      venda ESTAGNADA (botão aparece, PATCH nega com 403) é o papercut de UX
 *      já documentado no comentário "ASSIMETRIA CONHECIDA" em
 *      multiAprovadorCond — coberto abaixo como exceção, não como falha do
 *      teste.
 *   3. protocolo_metal + tag limpeza_ouro:* — coberto SÓ no TS. O SQL de
 *      multiAprovadorCond não tem cláusula pra tipo='protocolo_metal' (só pra
 *      'aprovacao_quebra_metal'). Ou seja, aqui o TS é MAIS abrangente que o
 *      SQL — direção segura: o botão fica ausente/mais restritivo pra esse
 *      caso legado, nunca aparece indevido.
 *
 * ⚠️ Se ao mexer neste teste (ou no código) aparecer uma divergência ALÉM
 *   destas 3, NÃO ajuste o teste pra passar — é sinal de bug real; pare e
 *   reporte.
 */
describe("Simetria SQL (multiAprovadorCond) x TS (eventoDaTarefa)", () => {
  interface CasoMatriz {
    nome: string;
    tipo: string | null;
    tags: string[];
    tarefaInfo?: TarefaInfoParaEvento;
  }

  // Matriz extraída lendo multiAprovadorCond linha a linha
  // (src/app/api/tarefas/route.ts, ~L84-166). Cada entrada = um tipo/tag que o
  // SQL reconhece como multi-aprovador configurado (fora das 3 exceções
  // acima) — eventoDaTarefa DEVE devolver evento não-nulo pra cada uma.
  const matrizCobertaPeloSQL: CasoMatriz[] = [
    { nome: "desconto_acima (chave aprovador_desconto_padrao)", tipo: "desconto_acima", tags: [], tarefaInfo: { venda_id: 1 } },
    { nome: "cartao_desconto (chave aprovador_cartao_desconto_padrao)", tipo: "cartao_desconto", tags: [], tarefaInfo: { venda_id: 1 } },
    { nome: "entrega_sem_pagamento_total (chave aprovador_entrega_sem_pagamento)", tipo: "entrega_sem_pagamento_total", tags: [] },
    { nome: "compra_comercial (chave aprovador_compra_comercial)", tipo: "compra_comercial", tags: [] },
    { nome: "compra_metal (chave metal_aprovador_id)", tipo: "compra_metal", tags: [] },
    { nome: "recebimento_metal (chave metal_aprovador_id)", tipo: "recebimento_metal", tags: [] },
    { nome: "aprovacao_quebra_metal (chave aprovador_limpeza)", tipo: "aprovacao_quebra_metal", tags: [] },
    { nome: "garantia_fora_prazo (chave aprovadores_garantia_fora_prazo)", tipo: "garantia_fora_prazo", tags: [] },
    { nome: "frete_avulso (chave aprovadores_frete_avulso, pagante='cliente')", tipo: "frete_avulso", tags: [] },
    {
      nome: "frete_avulso_loja (chave aprovadores_frete_avulso_loja, migration 354, pagante='loja')",
      tipo: "frete_avulso",
      tags: [],
      // BLOCO 2 (jul/2026): o SQL (multiAprovadorCond) casa por evfa.pagante
      // (join com entregas_venda) — o TS espelha isso via tarefaInfo.frete_pagante,
      // NÃO mais pela tag. Ver evento-da-tarefa.ts.
      tarefaInfo: { frete_pagante: "loja" },
    },
    {
      nome: "credito_loja + tag gerente (chave aprovadora_credito_gerente) — venda ATIVA",
      tipo: null,
      tags: ["credito_loja", "gerente"],
      tarefaInfo: { venda_id: 1, venda_situacao: "aguardando_aprovacao", aprovacao_credito_tipo: "gerente" },
    },
    {
      nome: "credito_loja + tag diretor (chave aprovador_credito_diretor) — venda ATIVA",
      tipo: null,
      tags: ["credito_loja", "diretor"],
      tarefaInfo: { venda_id: 1, venda_situacao: "aguardando_aprovacao", aprovacao_credito_tipo: "diretor" },
    },
    { nome: "devolucao_estoque (chave aprovador_devolucao_estoque)", tipo: null, tags: ["devolucao_estoque"] },
    { nome: "devolucao sem devolucao_estoque (chave aprovador_devolucao)", tipo: null, tags: ["devolucao"] },
  ];

  it.each(matrizCobertaPeloSQL)("$nome → eventoDaTarefa devolve evento NÃO-NULO", ({ tipo, tags, tarefaInfo }) => {
    expect(eventoDaTarefa(tipo, tags, tarefaInfo)).not.toBeNull();
  });

  describe("EXCEÇÃO 1 — conversao*: null DE PROPÓSITO (endpoint próprio, sem linha em aprovacoes_tarefa)", () => {
    it("conversao_reversa (coberto pelo SQL via reversaAprovadorCond) → eventoDaTarefa é null, e está OK", () => {
      expect(eventoDaTarefa("conversao_reversa", [], {})).toBeNull();
    });
    it("conversao (coberto pelo SQL) → null, e está OK", () => {
      expect(eventoDaTarefa("conversao", [], {})).toBeNull();
    });
    it("conversao_sku (coberto pelo SQL, mesma chave de 'conversao') → null, e está OK", () => {
      expect(eventoDaTarefa("conversao_sku", [], {})).toBeNull();
    });
  });

  describe("EXCEÇÃO 2 — credito_loja: depende do estado da venda (ver comentário em multiAprovadorCond)", () => {
    it("venda ESTAGNADA (cancelado) → eventoDaTarefa null mesmo com as tags certas (SQL diria pode_decidir=true — papercut de UX documentado, não bug)", () => {
      expect(
        eventoDaTarefa(null, ["credito_loja", "gerente"], {
          venda_id: 1,
          venda_situacao: "cancelado",
          aprovacao_credito_tipo: "gerente",
        }),
      ).toBeNull();
    });
    it("aprovacao_credito_tipo NULL → eventoDaTarefa null mesmo com as tags certas (mesmo papercut documentado)", () => {
      expect(
        eventoDaTarefa(null, ["credito_loja", "diretor"], {
          venda_id: 1,
          venda_situacao: "aguardando_aprovacao",
          aprovacao_credito_tipo: null,
        }),
      ).toBeNull();
    });
  });

  it("EXCEÇÃO 3 — protocolo_metal + tag limpeza_ouro:* é evento no TS mas NÃO tem cláusula em multiAprovadorCond (UI mais restritiva, direção segura)", () => {
    expect(eventoDaTarefa("protocolo_metal", ["limpeza_ouro:123"], {})).toBe("limpeza_ouro");
  });
});
