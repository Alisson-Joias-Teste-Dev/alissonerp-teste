/**
 * Testes ANTI-VOLTA — detalhe de UM fechamento (03/08/2026, página
 * `/entregas-venda/fechamentos/[id]`).
 *
 * Cobre `obterFechamentoFreteDetalhe` (src/lib/frete-fechamento.ts):
 *   1. 🔴 O TESTE QUE IMPORTA — separação `doFechamento`: os lançamentos que a
 *      PRÓPRIA rotina gravou (zeragem + verba) não podem ser contados como
 *      movimento do mês. Somar tudo junto no fechamento #1 real daria
 *      R$ 1.457,37 / R$ 706,36 em vez de R$ 706,36 / R$ 697,00 do cabeçalho.
 *      O critério é a flag `do_fechamento` calculada no SQL
 *      (`s.created_at >= f.created_at`) — este teste garante que ela é lida e
 *      propagada, e que os totais do mês (que a tela mostra) continuam vindo
 *      do CABEÇALHO, nunca de soma feita em JS.
 *   2. A query dos lançamentos calcula a flag no banco (não no JS) e filtra
 *      pelo `fechamento_id` pedido.
 *   3. Id inexistente -> null (a página responde 404, não 500).
 *   4. Fechamento positivo (sem tarefa) -> `aprovacao` null e NENHUMA consulta
 *      extra em `tarefas` (não faz query à toa no caso mais comum).
 *   5. Saldo negativo -> traz o rastro da decisão (aprovador, motivo, datas).
 *   6. Campos DATE/TIMESTAMP chegam como objeto `Date` do driver postgres.js —
 *      mesma armadilha coberta em frete-fechamento-relatorio-mensal.test.ts.
 *   7. Entrega/venda/cliente ausentes (ajuste manual de saldo) não quebram —
 *      viram null, que é o que a tela usa pra renderizar a linha "Ajuste".
 *
 * Estratégia de mock: a função recebe `db` como PARÂMETRO (não importa
 * `@/lib/db` fixo) — mock direto, sem `vi.mock`. Responde por conteúdo da
 * query, MESMO padrão dos outros testes do módulo.
 */
import { describe, it, expect, vi } from "vitest";
import { obterFechamentoFreteDetalhe } from "@/lib/frete-fechamento";

function textoDaChamada(call: readonly unknown[]): string {
  const [strings, ...vals] = call as [string[], ...unknown[]];
  const stringsText = Array.isArray(strings) ? strings.join(" ") : String(strings);
  const valsText = vals.map((v) => {
    try { return typeof v === "string" ? v : JSON.stringify(v); } catch { return String(v); }
  }).join(" ");
  return `${stringsText} ${valsText}`;
}

const GERENTE_ID = "99999999-9999-9999-9999-999999999999";

/** Cabeçalho espelhando o fechamento #1 REAL de produção (03/08/2026). */
function cabecalhoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    gerente_id: GERENTE_ID,
    mes_referencia: new Date("2026-08-01"),
    saldo_anterior: "0.00",
    total_creditos: "706.36",
    total_debitos: "697.00",
    saldo_final: "9.36",
    verba_creditada: "751.01",
    faturamento_base: "751010.92",
    percentual_verba: "0.1000",
    status: "fechado",
    tarefa_aprovacao_id: null,
    conta_pagar_id: null,
    created_at: new Date("2026-08-03T17:13:10.878Z"),
    gerente_nome: "Germana Valentim",
    ...overrides,
  };
}

function lancamentoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 79,
    tipo: "credito",
    valor: "75.00",
    descricao: "Frete cobrado R$ 150.00 > motoboy R$ 75.00",
    created_at: new Date("2026-07-31T20:46:32Z"),
    do_fechamento: false,
    entrega_id: 556,
    codigo_entrega: "ENT-20260731-00018",
    situacao_entrega: "confirmada",
    frete_cobrado: "150.00",
    frete_motoboy: "75.00",
    venda_id: 30511,
    numero_venda: "15885",
    cliente_nome: "Márcia Nogueira",
    is_avulso: false,
    descricao_avulso: null,
    is_teste: false,
    ...overrides,
  };
}

/** Os DOIS lançamentos que a própria rotina grava (mesma transação do fechamento). */
const LANC_ZERAGEM = lancamentoRow({
  id: 81, tipo: "debito", valor: "9.36", do_fechamento: true,
  descricao: "Fechamento agosto de 2026: zeragem do saldo positivo (contra-lançamento)",
  created_at: new Date("2026-08-03T17:13:10.878Z"),
  entrega_id: null, codigo_entrega: null, situacao_entrega: null,
  frete_cobrado: null, frete_motoboy: null, venda_id: null, numero_venda: null, cliente_nome: null,
});
const LANC_VERBA = lancamentoRow({
  id: 82, tipo: "credito", valor: "751.01", do_fechamento: true,
  descricao: "Verba de frete grátis — agosto de 2026 (0.1% do faturamento do mês anterior)",
  created_at: new Date("2026-08-03T17:13:10.878Z"),
  entrega_id: null, codigo_entrega: null, situacao_entrega: null,
  frete_cobrado: null, frete_motoboy: null, venda_id: null, numero_venda: null, cliente_nome: null,
});

function criarDbMock(opts: {
  cabecalho?: Record<string, unknown> | null;
  lancamentos?: Record<string, unknown>[];
  aprovacao?: Record<string, unknown> | null;
  /** Valor cru da config `contatos_teste` (CSV). undefined = chave não existe. */
  contatosTeste?: string;
  /** Valor cru da config `entregas_teste` (CSV). undefined = chave não existe. */
  entregasTeste?: string;
}) {
  const calls: unknown[][] = [];
  const fn = vi.fn((...args: unknown[]) => {
    calls.push(args);
    const texto = textoDaChamada(args);
    if (texto.includes("FROM alissonerp.configuracoes_unificado")) {
      // As duas chaves saem da MESMA query (lerConfigListaDeIds) — o que muda é
      // o parâmetro interpolado, então o mock responde por ele.
      const chave = texto.includes("entregas_teste") ? "entregas_teste" : "contatos_teste";
      const valor = chave === "entregas_teste" ? opts.entregasTeste : opts.contatosTeste;
      return Promise.resolve(valor === undefined ? [] : [{ valor }]);
    }
    if (texto.includes("FROM alissonerp.saldo_frete_gratis")) {
      return Promise.resolve(opts.lancamentos ?? []);
    }
    if (texto.includes("FROM alissonerp.tarefas")) {
      return Promise.resolve(opts.aprovacao ? [opts.aprovacao] : []);
    }
    return Promise.resolve(opts.cabecalho === null ? [] : [opts.cabecalho ?? cabecalhoRow()]);
  });
  // `db.array(...)` do postgres.js — usado para passar a lista de contatos de
  // teste como bigint[]. No mock, devolve o próprio array.
  (fn as unknown as { array: (a: unknown[]) => unknown[] }).array = (a: unknown[]) => a;
  return { fn, calls };
}

describe("obterFechamentoFreteDetalhe", () => {
  it("separa os lançamentos da própria rotina do movimento do mês (contas do cabeçalho continuam batendo)", async () => {
    const doMes = [
      lancamentoRow({ id: 79, tipo: "credito", valor: "75.00" }),
      lancamentoRow({ id: 78, tipo: "credito", valor: "80.00" }),
      lancamentoRow({ id: 72, tipo: "debito", valor: "40.00" }),
    ];
    const { fn } = criarDbMock({ lancamentos: [LANC_VERBA, LANC_ZERAGEM, ...doMes] });

    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);
    expect(detalhe).not.toBeNull();

    const mes = detalhe!.lancamentos.filter((l) => !l.doFechamento);
    const rotina = detalhe!.lancamentos.filter((l) => l.doFechamento);
    expect(mes.map((l) => l.id).sort()).toEqual([72, 78, 79]);
    expect(rotina.map((l) => l.id).sort()).toEqual([81, 82]);

    // 🔴 O ponto do teste: os totais mostrados são os do CABEÇALHO. Se um dia
    // alguém trocar por soma dos lançamentos, a soma de TUDO daria 906,01 de
    // crédito (75+80+751,01) — nada a ver com os 706,36 apurados.
    expect(detalhe!.cabecalho.totalCreditos).toBe(706.36);
    expect(detalhe!.cabecalho.totalDebitos).toBe(697);
    const somaIngenuaCreditos = detalhe!.lancamentos
      .filter((l) => l.tipo === "credito")
      .reduce((acc, l) => acc + l.valor, 0);
    expect(somaIngenuaCreditos).not.toBe(detalhe!.cabecalho.totalCreditos);
  });

  it("calcula a flag do_fechamento no BANCO (comparando created_at) e filtra pelo id pedido", async () => {
    const { fn, calls } = criarDbMock({ lancamentos: [lancamentoRow()] });
    await obterFechamentoFreteDetalhe(fn, 7);

    const queryLancamentos = calls.map(textoDaChamada)
      .find((t) => t.includes("FROM alissonerp.saldo_frete_gratis"));
    expect(queryLancamentos).toBeDefined();
    expect(queryLancamentos).toContain("s.created_at >= f.created_at");
    expect(queryLancamentos).toContain("WHERE s.fechamento_id =");
    expect(queryLancamentos).toContain("7");
  });

  it("devolve null quando o fechamento não existe (página vira 404, não 500)", async () => {
    const { fn, calls } = criarDbMock({ cabecalho: null });
    expect(await obterFechamentoFreteDetalhe(fn, 999)).toBeNull();
    // Não vai atrás de lançamentos de um fechamento que não existe.
    expect(calls.map(textoDaChamada).some((t) => t.includes("FROM alissonerp.saldo_frete_gratis"))).toBe(false);
  });

  it("fechamento positivo: sem aprovação e sem consultar tarefas", async () => {
    const { fn, calls } = criarDbMock({ lancamentos: [LANC_VERBA, LANC_ZERAGEM] });
    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);

    expect(detalhe!.aprovacao).toBeNull();
    expect(calls.map(textoDaChamada).some((t) => t.includes("FROM alissonerp.tarefas"))).toBe(false);
  });

  it("saldo negativo: traz o rastro da decisão (aprovador, motivo e datas)", async () => {
    const { fn } = criarDbMock({
      cabecalho: cabecalhoRow({
        saldo_final: "-225.64", status: "recusado", tarefa_aprovacao_id: 900,
      }),
      lancamentos: [lancamentoRow()],
      aprovacao: {
        tarefa_id: 900,
        titulo: "Fechamento de frete grátis negativo — agosto de 2026",
        status_tarefa: "concluida",
        criado_em: new Date("2026-08-01T09:00:00Z"),
        status_aprovacao: "recusado",
        motivo: "Loja absorve o prejuízo neste mês.",
        respondido_em: new Date("2026-08-02T13:20:00Z"),
        solicitante_nome: "Jonathan Araujo",
        aprovador_nome: "Alisson",
      },
    });

    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);
    expect(detalhe!.aprovacao).toMatchObject({
      tarefaId: 900,
      statusAprovacao: "recusado",
      aprovadorNome: "Alisson",
      motivo: "Loja absorve o prejuízo neste mês.",
    });
    expect(detalhe!.aprovacao!.respondidoEm).toBe("2026-08-02T13:20:00.000Z");
  });

  it("colunas DATE/TIMESTAMP chegam como Date do driver e viram string ISO/YYYY-MM-DD", async () => {
    const { fn } = criarDbMock({ lancamentos: [lancamentoRow()] });
    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);

    expect(detalhe!.cabecalho.mesReferencia).toBe("2026-08-01");
    // ⚠️ Os MILISSEGUNDOS somem no caminho: o mapeamento faz
    // `new Date(String(valor))`, e `String(Date)` produz "Mon Aug 03 2026
    // 17:13:10 GMT+0000" — formato sem fração de segundo. Comportamento
    // HERDADO de `listarFechamentosFrete` (mantido de propósito: a tela mostra
    // data e hora, não milissegundo). Não afeta a separação `doFechamento`,
    // que é decidida no BANCO comparando os timestamps completos.
    expect(detalhe!.cabecalho.createdAt).toBe("2026-08-03T17:13:10.000Z");
    expect(detalhe!.lancamentos[0].createdAt).toBe("2026-07-31T20:46:32.000Z");
  });

  it("ajuste manual (sem entrega/venda/cliente) não quebra — vira null nos vínculos", async () => {
    const { fn } = criarDbMock({
      lancamentos: [lancamentoRow({
        id: 74, valor: "42.00",
        descricao: "Ajuste manual jul/2026 — saldo fixado em -R$ 225,64",
        entrega_id: null, codigo_entrega: null, situacao_entrega: null,
        frete_cobrado: null, frete_motoboy: null,
        venda_id: null, numero_venda: null, cliente_nome: null,
      })],
    });

    const [l] = (await obterFechamentoFreteDetalhe(fn, 1))!.lancamentos;
    expect(l).toMatchObject({
      id: 74, valor: 42, entregaId: null, codigoEntrega: null,
      freteCobrado: null, vendaId: null, clienteNome: null, doFechamento: false,
    });
  });

  it("contatos de teste: a config vira filtro no SQL e a flag chega no lançamento", async () => {
    // Pedido do Jonathan (03/08): "todos que estiverem no meu nome devem sair
    // desse relatório". A lista é CONFIG (migration 364), não código — se
    // alguém trocar por uma lista fixa, um contato de teste novo volta a
    // aparecer e só se descobre olhando a tela.
    const { fn, calls } = criarDbMock({
      contatosTeste: "224,394408, 4549 ,lixo,",
      lancamentos: [
        lancamentoRow({ id: 40, is_teste: true, cliente_nome: "Jonathan Araujo Chagas ( Programador )" }),
        lancamentoRow({ id: 41, is_teste: false }),
      ],
    });

    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);

    expect(detalhe!.lancamentos.find((l) => l.id === 40)!.isTeste).toBe(true);
    expect(detalhe!.lancamentos.find((l) => l.id === 41)!.isTeste).toBe(false);

    // A flag é resolvida no BANCO (não no JS), e os ids inválidos da config
    // ("lixo", vazio) são descartados antes de virar parâmetro.
    const queryLancamentos = calls.find((c) =>
      textoDaChamada(c).includes("FROM alissonerp.saldo_frete_gratis"))!;
    expect(textoDaChamada(queryLancamentos)).toContain("= ANY (");
    expect(queryLancamentos.slice(1)).toContainEqual([224, 394408, 4549]);
  });

  it("entrega de teste SEM cliente (frete avulso) também é marcada — via `entregas_teste`", async () => {
    // POR QUE ESTE TESTE: frete avulso não tem venda nem contato, então
    // `contatos_teste` NUNCA alcança ele (caso real: entrega 47,
    // ENT-20260610-00009, "teste de frete avulso"). Se alguém remover o OR por
    // entrega achando que é redundante, essa corrida volta pro relatório.
    const { fn, calls } = criarDbMock({
      contatosTeste: "224",
      entregasTeste: "47",
      lancamentos: [lancamentoRow({
        id: 16, entrega_id: 47, codigo_entrega: "ENT-20260610-00009",
        venda_id: null, numero_venda: null, cliente_nome: null,
        is_avulso: true, descricao_avulso: "teste de frete avulso",
        is_teste: true,
      })],
    });

    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);
    expect(detalhe!.lancamentos[0].isTeste).toBe(true);

    // As duas listas chegam na query, cada uma no seu parâmetro.
    const queryLancamentos = calls.find((c) =>
      textoDaChamada(c).includes("FROM alissonerp.saldo_frete_gratis"))!;
    expect(textoDaChamada(queryLancamentos)).toContain("s.entrega_id = ANY (");
    expect(queryLancamentos.slice(1)).toContainEqual([224]);
    expect(queryLancamentos.slice(1)).toContainEqual([47]);
  });

  it("config `contatos_teste` ausente: ninguém é marcado como teste (array vazio, sem quebrar)", async () => {
    const { fn, calls } = criarDbMock({ lancamentos: [lancamentoRow()] }); // sem contatosTeste

    const detalhe = await obterFechamentoFreteDetalhe(fn, 1);

    expect(detalhe!.lancamentos[0].isTeste).toBe(false);
    const queryLancamentos = calls.find((c) =>
      textoDaChamada(c).includes("FROM alissonerp.saldo_frete_gratis"))!;
    expect(queryLancamentos.slice(1)).toContainEqual([]);
  });

  it("frete avulso: sem cliente por natureza, mas com a descrição da corrida", async () => {
    // CONFERIDO em prod: 6 dos 68 lançamentos do fechamento #1 são assim —
    // corrida sem venda e sem contato. A tela mostra a descrição no lugar do
    // cliente; se estes campos sumirem do SELECT, a linha vira "—" e o
    // Jonathan perde a única pista do que foi aquela corrida.
    const { fn } = criarDbMock({
      lancamentos: [lancamentoRow({
        id: 49, codigo_entrega: "ENT-20260731-00006",
        venda_id: null, numero_venda: null, cliente_nome: null,
        is_avulso: true, descricao_avulso: "Buscar a peça da cliente que deu problema",
      })],
    });

    const [l] = (await obterFechamentoFreteDetalhe(fn, 1))!.lancamentos;
    expect(l).toMatchObject({
      entregaId: 556, clienteNome: null, isAvulso: true,
      descricaoAvulso: "Buscar a peça da cliente que deu problema",
    });
  });
});
