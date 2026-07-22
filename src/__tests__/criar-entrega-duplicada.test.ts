/**
 * Testes ANTI-VOLTA — trava de entrega duplicada em aberto (fix 21/07).
 *
 * BUG ORIGINAL: `criarEntrega` (src/lib/entrega-venda.ts) grava a linha
 * `entregas_venda` já em `pendente` no clique de "Marcar Entrega" — a
 * confirmação (código A/B) só acontece depois. `vw_entregas_pendentes`
 * (migration 285) só desconta entregas `situacao='confirmada'`, então
 * reabrir "Marcar Entrega" para os MESMOS itens antes de confirmar a 1ª
 * mostrava o saldo cheio de novo e deixava criar uma 2ª linha pendente para
 * o mesmo item (evidência real: venda 15500 em homolog, entregas 101/102).
 *
 * O QUE ESTE ARQUIVO COBRE:
 *   P1 — guard "amigável" (fora da transação) barra a 2ª entrega quando já
 *     existe uma aberta ('pendente'/'em_rota') para o MESMO item, com
 *     mensagem clara — e a transação NUNCA abre (sql.begin não é chamado).
 *   P2 — granularidade é por ITEM, não por venda: itens diferentes (sem
 *     entrega aberta) passam pelo guard normalmente — a entrega PARCIAL
 *     legítima não é quebrada.
 *   P3 — trava ATÔMICA dentro da transação: mesmo que o guard de fora não
 *     tenha achado nada (janela de corrida do duplo-clique), o re-check
 *     DEPOIS do lock (FOR UPDATE em itens_venda_erp) dentro do sql.begin
 *     também barra, provando que a proteção real contra corrida está
 *     DENTRO da transação, não só no SELECT solto de fora.
 *
 * Estratégia de mock: igual à de frete-avulso-invariantes-lib.test.ts —
 * `sql` mockado como função de template tag + `.begin`. Para P3, `begin`
 * de fato invoca o callback com um `tx` mock próprio (em vez de só rejeitar
 * com sentinela), permitindo testar o que acontece DENTRO da transação sem
 * simular o INSERT inteiro (geração de código, itens, auditoria, saldo de
 * frete grátis — fora do escopo deste arquivo, que é só o portão de
 * duplicata).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SENTINEL = "SENTINEL_REACHED_CODE_GEN";

const sqlMock = Object.assign(
  vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[])),
  { begin: vi.fn() },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({
  enviarCodigoWhatsAppDetalhado: vi.fn(),
  enviarCodigoClienteEmRota: vi.fn(),
  enviarConfirmacaoEntregaConcluida: vi.fn(),
  enviarAvisoDesenvolvedor: vi.fn(),
}));
// vendaEntregaDevendo/vendaTemExcecaoEntregaAprovada não usam o sqlMock —
// mockadas à parte para não poluir a fila de chamadas do teste (mesmo
// padrão de entrega-detalhe-endereco-resolvido.test.ts).
vi.mock("@/lib/entrega-sem-pagamento", () => ({
  vendaEntregaDevendo: vi.fn(() => Promise.resolve(false)),
  vendaTemExcecaoEntregaAprovada: vi.fn(() => Promise.resolve(false)),
}));

const { criarEntrega } = await import("@/lib/entrega-venda");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const MOTOBOY_ID = "33333333-3333-3333-3333-333333333333";

function paramsBase(extra: Record<string, unknown> = {}) {
  return {
    vendaId: 100,
    tipo: "parcial" as const,
    formaEntrega: "motoboy" as const,
    itens: [{ itemVendaId: 1, quantidade: 1 }],
    motoboyId: MOTOBOY_ID,
    regiao: "fortaleza" as const,
    freteCobrado: 20,
    ...extra,
  };
}

const vendaAprovada = { id: 100, situacao: "aprovado", numero_venda: "V100", cliente_id: 1 };

/** Uma linha de vw_entregas_pendentes com saldo para o item informado. */
function saldoRow(itemVendaId: number, saldo = 1) {
  return {
    item_venda_id: itemVendaId,
    produto_id: 10,
    nome_produto: "Anel de Ouro",
    sku: "AN-001",
    qtd_vendida: saldo,
    qtd_entregue: 0,
    saldo_pendente: saldo,
  };
}

/** Enfileira as 3 consultas fora da transação que antecedem o guard novo:
 * 1. SELECT venda   2. calcularSaldoPendente   3. calcularBloqueioReposicao
 * (vendaEntregaDevendo é mock à parte, não consome a fila do sqlMock). */
function enfileirarAteOGuard(saldoRows: unknown[]) {
  sqlMock
    .mockResolvedValueOnce([vendaAprovada]) // 1. SELECT venda
    .mockResolvedValueOnce(saldoRows) // 2. calcularSaldoPendente
    .mockResolvedValueOnce([]); // 3. calcularBloqueioReposicao (nenhuma reposição aberta)
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin = vi.fn();
});

describe("P1 — guard amigável (fora da transação) barra duplicata pelo MESMO item", () => {
  it("item já em entrega aberta ('pendente') → barrado com mensagem clara citando o código; transação NUNCA abre", async () => {
    enfileirarAteOGuard([saldoRow(1)]);
    // 4. buscarItemJaEmEntregaAberta (guard novo, fora da tx): encontra duplicata
    sqlMock.mockResolvedValueOnce([{ item_venda_id: 1, codigo_entrega: "ENT-20260721-00003" }]);

    await expect(criarEntrega(paramsBase(), USER_ID)).rejects.toThrow(
      /Já existe uma entrega em aberto \(ENT-20260721-00003\)/,
    );

    expect((sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin).not.toHaveBeenCalled();
  });

  it("item já em entrega 'em_rota' (motoboy já retirou, ainda não confirmou) → também barrado", async () => {
    enfileirarAteOGuard([saldoRow(1)]);
    sqlMock.mockResolvedValueOnce([{ item_venda_id: 1, codigo_entrega: "ENT-20260721-00004" }]);

    await expect(criarEntrega(paramsBase(), USER_ID)).rejects.toThrow(
      /Já existe uma entrega em aberto/,
    );
    expect((sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin).not.toHaveBeenCalled();
  });

  it("SEM entrega aberta para o item → passa do guard e a transação ABRE normalmente", async () => {
    enfileirarAteOGuard([saldoRow(1)]);
    sqlMock.mockResolvedValueOnce([]); // guard: nada encontrado

    (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin.mockRejectedValueOnce(
      new Error(SENTINEL),
    );

    await expect(criarEntrega(paramsBase(), USER_ID)).rejects.toThrow(SENTINEL);
  });
});

describe("P2 — granularidade por ITEM: entrega parcial legítima não é quebrada", () => {
  it("venda com 2 itens: item A já tem entrega aberta, mas a nova solicitação é só do item B (diferente) → NÃO é barrada pelo guard", async () => {
    // Pedido de entrega só do item 2 (item 1 é quem está preso na entrega aberta).
    enfileirarAteOGuard([saldoRow(2)]);
    // O guard consulta especificamente ANY([2]) — no banco real isso não
    // bateria com a linha aberta do item 1; aqui simulamos o resultado real
    // (vazio) para provar que o fluxo segue sem barrar a entrega do item B.
    sqlMock.mockResolvedValueOnce([]);

    (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin.mockRejectedValueOnce(
      new Error(SENTINEL),
    );

    await expect(
      criarEntrega(paramsBase({ itens: [{ itemVendaId: 2, quantidade: 1 }] }), USER_ID),
    ).rejects.toThrow(SENTINEL);
  });
});

describe("P3 — trava ATÔMICA dentro da transação (duplo-clique / corrida)", () => {
  it("guard de fora não achou nada (janela de corrida), mas o re-check DEPOIS do lock dentro da tx encontra a duplicata recém-commitada → aborta SEM gerar código", async () => {
    enfileirarAteOGuard([saldoRow(1)]);
    sqlMock.mockResolvedValueOnce([]); // guard de fora: nada (ainda) — outra requisição está prestes a vencer

    const txMock = vi
      .fn()
      .mockResolvedValueOnce([]) // 1: SELECT ... FOR UPDATE (lock adquirido)
      .mockResolvedValueOnce([{ item_venda_id: 1, codigo_entrega: "ENT-20260721-00005" }]); // 2: re-check dentro da tx — outra tx venceu a corrida e já commitou

    (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin.mockImplementationOnce(
      (cb: (tx: unknown) => unknown) => cb(txMock),
    );

    await expect(criarEntrega(paramsBase(), USER_ID)).rejects.toThrow(
      /Já existe uma entrega em aberto \(ENT-20260721-00005\)/,
    );

    // Só 2 chamadas dentro da tx (lock + re-check) — nunca chegou a gerar
    // código de entrega nem inserir nada.
    expect(txMock).toHaveBeenCalledTimes(2);
  });

  it("guard de fora e o re-check dentro da tx concordam (nenhum acha duplicata) → segue e chega na geração de código", async () => {
    enfileirarAteOGuard([saldoRow(1)]);
    sqlMock.mockResolvedValueOnce([]); // guard de fora: nada

    const txMock = vi
      .fn()
      .mockResolvedValueOnce([]) // 1: SELECT ... FOR UPDATE
      .mockResolvedValueOnce([]) // 2: re-check dentro da tx: nada
      .mockRejectedValueOnce(new Error(SENTINEL)); // 3: gerarCodigoEntrega — sentinela

    (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin.mockImplementationOnce(
      (cb: (tx: unknown) => unknown) => cb(txMock),
    );

    await expect(criarEntrega(paramsBase(), USER_ID)).rejects.toThrow(SENTINEL);
    expect(txMock).toHaveBeenCalledTimes(3);
  });
});
