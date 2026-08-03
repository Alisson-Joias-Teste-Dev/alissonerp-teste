/**
 * Testes ANTI-VOLTA — BLOCO 4 (verba de frete grátis, rotina do dia 01).
 *
 * Cobre `src/lib/frete-fechamento.ts`:
 *   1. Idempotência: rodar a rotina 2x no mesmo mês/gerente → o INSERT
 *      `ON CONFLICT (gerente_id, mes_referencia) DO NOTHING` devolve 0 linhas
 *      na 2ª chamada e a função retorna cedo (`jaFechado: true`) — nenhuma
 *      outra escrita (contra-lançamento, verba, tarefa) roda.
 *   2. Saldo POSITIVO → zera (contra-lançamento débito), status='fechado',
 *      SEM tarefa — a verba nova entra do mesmo jeito.
 *   3. Saldo NEGATIVO → contra-lançamento crédito, status='aguardando_aprovacao',
 *      cria tarefa (tipo 'fechamento_frete_negativo') com o pool configurado.
 *   4. Verba = 0 (sem faturamento no mês anterior) → não insere crédito de
 *      verba (a linha seria só ruído no razão).
 *   5. `aprovarFechamentoFreteNoTx` / `recusarFechamentoFreteNoTx` — geram (ou
 *      não) a conta a pagar e atualizam o status do fechamento.
 *
 * Estratégia de mock (mesma família dos demais testes de frete_avulso): `sql`
 * mockado como tagged-template — mas em vez de fila posicional (frágil a
 * qualquer reordenação de query dentro da função), o mock RESPONDE POR
 * CONTEÚDO (regex no texto da query) — mais robusto a mudanças de ordem
 * dentro da mesma transação sem perder precisão sobre QUAL query recebeu QUAL
 * resposta. `resolverGerenteFreteGratisId`/`obterSaldoFreteGerenteNoTx`
 * (src/lib/entrega-venda.ts) e `calcularVerbaFreteGratis`
 * (src/lib/frete-verba.ts) são mockados inteiros — este arquivo testa SÓ a
 * lógica de fechamento, não as funções que ele reusa (essas já têm os
 * próprios testes: frete-gerente-configuravel.test.ts,
 * frete-verba-equivalente-dashboard.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockResolverGerente = vi.fn();
const mockObterSaldo = vi.fn();
vi.mock("@/lib/entrega-venda", () => ({
  resolverGerenteFreteGratisId: (...args: unknown[]) => mockResolverGerente(...args),
  obterSaldoFreteGerenteNoTx: (...args: unknown[]) => mockObterSaldo(...args),
}));

const mockCalcularVerba = vi.fn();
vi.mock("@/lib/frete-verba", () => ({
  calcularVerbaFreteGratis: (...args: unknown[]) => mockCalcularVerba(...args),
}));

interface Resposta { match: RegExp; value: unknown }

/**
 * Mock de tagged template que responde por CONTEÚDO (regex), não por posição.
 * `vi.fn()` SEM tipar a implementação inicial (mesmo padrão de
 * aprovacao-frete-avulso-atomicidade.test.ts) — as queries do postgres.js
 * retornam array (`Promise<unknown[]>`), mas tipar a implementação inicial
 * força esse contrato em `mockImplementation` também, e `Resposta.value` é
 * `unknown` (aceita array OU objeto único, ver uso abaixo) — o retorno real
 * de cada chamada é resolvido em runtime por `configurarRespostas`, nunca
 * pela implementação passada aqui (todo teste chama `configurarRespostas`
 * antes de exercitar a função, e `beforeEach` já reseta a implementação).
 */
const sqlMock = Object.assign(
  vi.fn(),
  {
    array: (arr: unknown[]) => arr,
    begin: (cb: (tx: unknown) => unknown) => cb(sqlMock),
  },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

/**
 * Texto completo de UMA chamada do mock — junta a parte ESTÁTICA da query
 * (`strings`, o array de pedaços entre os `${}`) com os VALORES interpolados
 * (${a}, ${b}...). Necessário porque literais como 'pendente'/'frete_gratis'
 * vivem em `strings` (escritos direto no SQL), enquanto a descrição
 * (ex.: "zeragem do saldo positivo") é um VALOR interpolado (`${...texto...}`)
 * — checar só `strings` perde tudo que é dado dinâmico.
 */
function textoDaChamada(call: readonly unknown[]): string {
  const [strings, ...vals] = call as [string[], ...unknown[]];
  const stringsText = Array.isArray(strings) ? strings.join(" ") : String(strings);
  const valsText = vals
    .map((v) => {
      try {
        return typeof v === "string" ? v : JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .join(" ");
  return `${stringsText} ${valsText}`;
}

/** Configura as respostas do mock para o teste atual (substitui a implementação). */
function configurarRespostas(respostas: Resposta[]) {
  sqlMock.mockImplementation((...call: unknown[]) => {
    const text = textoDaChamada(call);
    const achado = respostas.find((r) => r.match.test(text));
    return Promise.resolve(achado ? achado.value : []);
  });
}

/** Acha a chamada do mock cujo texto (estático + valores) bate com `match`. */
function acharChamada(match: RegExp): unknown[] | undefined {
  return sqlMock.mock.calls.find((call) => match.test(textoDaChamada(call)));
}

const GERENTE_ID = "99999999-9999-9999-9999-999999999999";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const HOJE = new Date(2026, 7, 1); // 1º de agosto de 2026 (mês 7 = agosto, 0-indexado)

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockReset();
  mockResolverGerente.mockResolvedValue(GERENTE_ID);
  mockCalcularVerba.mockResolvedValue({
    verba: 100,
    faturamentoBase: 100000,
    percentual: 0.1,
    inicioMesAnterior: "2026-07-01",
    fimMesAnterior: "2026-07-31",
  });
});

const { fecharMesFreteGratisAutomatico, aprovarFechamentoFreteNoTx, recusarFechamentoFreteNoTx } =
  await import("@/lib/frete-fechamento");

describe("BLOCO 4 — item 1: idempotência (rodar 2x no mesmo mês/gerente)", () => {
  it("INSERT ON CONFLICT devolve 0 linhas → jaFechado:true, NENHUMA outra escrita roda", async () => {
    mockObterSaldo.mockResolvedValue(50);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 50, debitos: 0 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [] }, // ON CONFLICT DO NOTHING — já fechado
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado).toEqual({ jaFechado: true });
    expect(acharChamada(/INSERT INTO alissonerp\.saldo_frete_gratis/)).toBeUndefined();
    expect(acharChamada(/INSERT INTO alissonerp\.tarefas/)).toBeUndefined();
  });
});

describe("BLOCO 4 — item 2: saldo POSITIVO zera, SEM tarefa, verba entra do mesmo jeito", () => {
  it("saldo final +30 → contra-lançamento débito, status='fechado', verba creditada, tarefaId null", async () => {
    mockObterSaldo.mockResolvedValue(30);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 50, debitos: 20 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 501 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado.jaFechado).toBe(false);
    expect(resultado.status).toBe("fechado");
    expect(resultado.saldoFinal).toBe(30);
    expect(resultado.saldoAnterior).toBe(0); // 30 - 50 + 20 = 0
    expect(resultado.tarefaId).toBeNull();
    expect(resultado.verbaCreditada).toBe(100);

    // Contra-lançamento: débito de 30 (zera o positivo).
    const contraLancamento = acharChamada(/zeragem do saldo positivo/);
    expect(contraLancamento).toBeDefined();
    // Verba entra sempre.
    expect(acharChamada(/Verba de frete grátis/)).toBeDefined();
    // Nenhuma tarefa criada.
    expect(acharChamada(/INSERT INTO alissonerp\.tarefas/)).toBeUndefined();
  });

  it("saldo final exatamente 0 → NÃO insere contra-lançamento (já está zerado)", async () => {
    mockObterSaldo.mockResolvedValue(0);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 20, debitos: 20 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 502 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado.status).toBe("fechado");
    expect(acharChamada(/zeragem do saldo/)).toBeUndefined();
  });
});

describe("BLOCO 4 — item 3: saldo NEGATIVO cria tarefa de aprovação", () => {
  it("saldo final -40 → contra-lançamento crédito, status='aguardando_aprovacao', tarefa criada com o pool configurado", async () => {
    mockObterSaldo.mockResolvedValue(-40);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 10, debitos: 50 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 777 }] },
      { match: /aprovadores_fechamento_frete/, value: [{ valor: "aprov-1,aprov-2" }] },
      { match: /INSERT INTO alissonerp\.tarefas/, value: [{ id: 900 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado.status).toBe("aguardando_aprovacao");
    expect(resultado.saldoFinal).toBe(-40);
    expect(resultado.tarefaId).toBe(900);
    expect(resultado.aprovadoresNotificar).toEqual(["aprov-1", "aprov-2"]);

    expect(acharChamada(/zeragem do saldo negativo/)).toBeDefined();
    expect(acharChamada(/INSERT INTO alissonerp\.aprovacoes_tarefa/)).toBeDefined();

    // A tarefa nasce com o tipo exclusivo do fluxo (literal no SQL, não valor
    // interpolado), responsável = 1º da lista configurada (valor interpolado).
    const tarefaCall = acharChamada(/INSERT INTO alissonerp\.tarefas/)!;
    expect(textoDaChamada(tarefaCall)).toContain("fechamento_frete_negativo");
    expect(tarefaCall.slice(1)).toContain("aprov-1");
  });

  it("saldo negativo mas NENHUM aprovador configurado → tarefa criada sem responsável (não trava o ciclo)", async () => {
    mockObterSaldo.mockResolvedValue(-10);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 0, debitos: 10 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 778 }] },
      { match: /aprovadores_fechamento_frete/, value: [] }, // config vazia
      { match: /INSERT INTO alissonerp\.tarefas/, value: [{ id: 901 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado.tarefaId).toBe(901);
    expect(resultado.aprovadoresNotificar).toEqual([]);
    // Sem responsável configurado — não insere aprovacoes_tarefa (aprovador_id seria nulo).
    expect(acharChamada(/INSERT INTO alissonerp\.aprovacoes_tarefa/)).toBeUndefined();
  });
});

describe("BLOCO 4 — item 4: verba zero não gera lançamento de crédito", () => {
  it("faturamento do mês anterior = 0 → verba = 0 → nenhum INSERT de 'Verba de frete grátis'", async () => {
    mockCalcularVerba.mockResolvedValue({ verba: 0, faturamentoBase: 0, percentual: 0.1 });
    mockObterSaldo.mockResolvedValue(0);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 0, debitos: 0 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 503 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(HOJE, USER_ID);

    expect(resultado.verbaCreditada).toBe(0);
    expect(acharChamada(/Verba de frete grátis/)).toBeUndefined();
  });
});

describe("BLOCO 4 — item 5: decisão da tarefa (aprovar/recusar)", () => {
  it("aprovar: cria contas_pagar (valor = |saldo negativo|, venc. dia 10) e marca status='pago' + conta_pagar_id", async () => {
    configurarRespostas([
      { match: /FROM alissonerp\.fechamentos_frete/, value: [{ id: 42, saldo_final: -123.45, mes_referencia: "2026-07-01" }] },
      { match: /INSERT INTO alissonerp\.contas_pagar/, value: [{ id: 55 }] },
    ]);

    const resultado = await aprovarFechamentoFreteNoTx(sqlMock, 900, USER_ID);

    expect(resultado).toEqual({ fechamentoId: 42, contaPagarId: 55, valor: 123.45 });
    const contaCall = acharChamada(/INSERT INTO alissonerp\.contas_pagar/)!;
    // 'pendente'/'frete_gratis' são literais escritos direto no SQL (strings),
    // não valores interpolados — checar o texto completo da chamada.
    expect(contaCall.slice(1)).toContain(123.45);
    expect(textoDaChamada(contaCall)).toContain("pendente");
    expect(textoDaChamada(contaCall)).toContain("frete_gratis");
    expect(acharChamada(/UPDATE alissonerp\.fechamentos_frete[\s\S]*status = 'pago'/)).toBeDefined();
  });

  it("recusar: marca status='recusado' com o motivo — NÃO cria contas_pagar", async () => {
    configurarRespostas([
      { match: /FROM alissonerp\.fechamentos_frete/, value: [{ id: 43 }] },
    ]);

    const resultado = await recusarFechamentoFreteNoTx(sqlMock, 901, "Saldo negativo grande demais este mês");

    expect(resultado).toEqual({ fechamentoId: 43 });
    expect(acharChamada(/INSERT INTO alissonerp\.contas_pagar/)).toBeUndefined();
    expect(acharChamada(/UPDATE alissonerp\.fechamentos_frete[\s\S]*status = 'recusado'/)).toBeDefined();
  });

  it("tarefa sem fechamento vinculado (não encontrado) → lança erro (nem aprovar nem recusar têm o que fazer)", async () => {
    configurarRespostas([]); // nenhum SELECT acha fechamento (default [])

    await expect(aprovarFechamentoFreteNoTx(sqlMock, 999, USER_ID)).rejects.toThrow(/não encontrado/i);
    await expect(recusarFechamentoFreteNoTx(sqlMock, 999, "motivo")).rejects.toThrow(/não encontrado/i);
  });
});

/**
 * 🔴 COMPETÊNCIA (03/08/2026) — a regra que NENHUM teste travava até aqui.
 *
 * `mes_referencia` é o mês FECHADO (o anterior ao de `hoje`), não o mês em que
 * a rotina rodou. Antes de 03/08 era o contrário, e a linha #1 de produção
 * nasceu com `2026-08-01`.
 *
 * POR QUE ISTO PRECISA DE TESTE: se alguém "consertar" o `- 1` de volta, a
 * rotina do dia seguinte grava um `mes_referencia` que ainda não existe na
 * tabela, o `ON CONFLICT (gerente_id, mes_referencia)` NÃO dispara, e a verba
 * do mês é CREDITADA DE NOVO — dinheiro a mais no saldo da gerente, em
 * silêncio. É a única proteção contra esse estrago.
 */
describe("competência: mes_referencia é o mês FECHADO, não o mês em que a rotina rodou", () => {
  /** Extrai o valor `YYYY-MM-DD` interpolado no INSERT do fechamento. */
  function mesReferenciaGravado(): string | undefined {
    const call = acharChamada(/INSERT INTO alissonerp\.fechamentos_frete/)!;
    return call.slice(1).find((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) as string | undefined;
  }

  it("rodando em 03/08/2026 → fecha JULHO (2026-07-01), não agosto", async () => {
    mockObterSaldo.mockResolvedValue(9.36);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 706.36, debitos: 697 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 601 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(new Date(2026, 7, 3), USER_ID);

    expect(resultado.mesReferencia).toBe("2026-07-01");
    expect(mesReferenciaGravado()).toBe("2026-07-01");
    // O rótulo dos lançamentos acompanha a competência — se ficar "agosto", o
    // extrato da gerente contradiz o cabeçalho do fechamento.
    expect(textoDaChamada(acharChamada(/zeragem do saldo positivo/)!)).toContain("julho");
  });

  it("a verba é calculada sobre a COMPETÊNCIA (recebe julho, não agosto)", async () => {
    mockObterSaldo.mockResolvedValue(0);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 0, debitos: 0 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 602 }] },
    ]);

    await fecharMesFreteGratisAutomatico(new Date(2026, 7, 3), USER_ID);

    const [dataPassada] = mockCalcularVerba.mock.calls.at(-1) as [Date];
    expect(dataPassada.getFullYear()).toBe(2026);
    expect(dataPassada.getMonth()).toBe(6); // 6 = julho (0-indexado)
    expect(dataPassada.getDate()).toBe(1);
  });

  it("vira o ANO: rodando em janeiro/2027 → fecha dezembro/2026", async () => {
    mockObterSaldo.mockResolvedValue(0);
    configurarRespostas([
      { match: /SUM\(valor\) FILTER/, value: [{ creditos: 0, debitos: 0 }] },
      { match: /INSERT INTO alissonerp\.fechamentos_frete/, value: [{ id: 603 }] },
    ]);

    const resultado = await fecharMesFreteGratisAutomatico(new Date(2027, 0, 1), USER_ID);

    expect(resultado.mesReferencia).toBe("2026-12-01");
  });
});
