/**
 * Testes ANTI-VOLTA — estorno do frete grátis ao CANCELAR entrega (fix 31/07).
 *
 * BUG ORIGINAL: `criarEntrega` (src/lib/entrega-venda.ts) lança crédito/débito
 * na conta de frete grátis da gerente no momento em que a entrega NASCE, em
 * cima da PREVISÃO (frete cobrado × frete do motoboy) — antes de se saber se a
 * entrega vai acontecer. `cancelarEntrega` só trocava `situacao` para
 * 'cancelada' e gravava auditoria: NÃO desfazia o lançamento. Resultado: toda
 * entrega cancelada deixava dinheiro fantasma no saldo da gerente.
 *
 * Evidência real (produção, 31/07/2026): entrega 551 (ENT-20260731-00013,
 * venda 15879) nasceu 13:02:20 creditando R$ 40,00 (frete cobrado R$ 60,00 >
 * motoboy R$ 20,00) e foi cancelada 25 segundos depois, às 13:02:45 — o
 * crédito ficou. No total havia 14 lançamentos órfãos de entregas canceladas,
 * R$ 82,00 líquidos A MAIS na conta da gerente, que iriam para o fechamento
 * mensal e para a conta a pagar dela.
 *
 * O QUE ESTE ARQUIVO COBRE:
 *   P1 — entrega que CREDITOU é estornada com contra-lançamento de DÉBITO de
 *     mesmo valor, amarrado à mesma entrega.
 *   P2 — entrega que DEBITOU é estornada com contra-lançamento de CRÉDITO.
 *   P3 — idempotência: líquido ZERO (já estornada) → NENHUM lançamento novo.
 *     É o que impede o estorno do estorno se a função rodar de novo.
 *   P4 — entrega sem nenhum lançamento de frete (ex.: retirada) → não grava
 *     nada e não quebra.
 *   P5 — o lançamento original NUNCA é apagado nem editado (nada de DELETE /
 *     UPDATE em saldo_frete_gratis): o extrato é histórico e auditável, mesmo
 *     padrão do fechamento mensal (src/lib/frete-fechamento.ts).
 *
 * Estratégia de mock: `sql` como tagged template + `.begin` que de fato invoca
 * o callback com um `tx` próprio, igual a criar-entrega-duplicada.test.ts. O
 * `tx` RESPONDE POR CONTEÚDO (regex no texto da query), como
 * frete-fechamento-mensal.test.ts — robusto a reordenação dentro da transação.
 * `obterSaldoFreteGerenteNoTx` NÃO é mockado: vive no mesmo módulo e roda
 * contra o `tx` mock, então o saldo_antes/saldo_depois gravados também entram
 * no teste.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const GERENTE_ID = "d1f11f68-3605-4798-ae91-737737515d0e";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const ENTREGA_ID = 551;

/** Query recebida pelo tx, já com o texto do template concatenado. */
interface QueryCapturada {
  texto: string;
  valores: unknown[];
}

let queries: QueryCapturada[] = [];

/** Líquido dos lançamentos DA ENTREGA que o tx deve devolver no agregado. */
let liquidoDaEntrega: { gerente_id: string; venda_id: number | null; liquido: number } | undefined;
/** Saldo geral da gerente que obterSaldoFreteGerenteNoTx deve enxergar. */
let saldoGeralDaGerente = 0;

function texto(strings: TemplateStringsArray): string {
  return strings.join("?");
}

const txMock = vi.fn((strings: TemplateStringsArray, ...valores: unknown[]) => {
  const t = texto(strings);
  queries.push({ texto: t, valores });

  // Agregado dos lançamentos DESTA entrega (WHERE entrega_id)
  if (/FROM alissonerp\.saldo_frete_gratis/.test(t) && /WHERE entrega_id/.test(t)) {
    return Promise.resolve(liquidoDaEntrega ? [liquidoDaEntrega] : []);
  }
  // Saldo geral da gerente (obterSaldoFreteGerenteNoTx — WHERE gerente_id)
  if (/FROM alissonerp\.saldo_frete_gratis/.test(t) && /WHERE gerente_id/.test(t)) {
    return Promise.resolve([{ saldo: saldoGeralDaGerente }]);
  }
  return Promise.resolve([]);
});

const sqlMock = Object.assign(
  vi.fn(() => Promise.resolve([
    { id: ENTREGA_ID, situacao: "pendente", codigo_entrega: "ENT-20260731-00013" },
  ] as unknown[])),
  {
    begin: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
  },
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
vi.mock("@/lib/entrega-sem-pagamento", () => ({
  vendaEntregaDevendo: vi.fn(() => Promise.resolve(false)),
  vendaTemExcecaoEntregaAprovada: vi.fn(() => Promise.resolve(false)),
}));

const { cancelarEntrega } = await import("@/lib/entrega-venda");

/** Os INSERTs em saldo_frete_gratis gravados na transação. */
function insertsDeSaldo(): QueryCapturada[] {
  return queries.filter((q) => /INSERT INTO alissonerp\.saldo_frete_gratis/.test(q.texto));
}

beforeEach(() => {
  queries = [];
  liquidoDaEntrega = undefined;
  saldoGeralDaGerente = 0;
  vi.clearAllMocks();
});

describe("cancelarEntrega — estorno do saldo de frete grátis", () => {
  it("P1 — entrega que creditou vira contra-lançamento de débito de mesmo valor", async () => {
    // Caso real: entrega 551 creditou R$ 40,00 e foi cancelada.
    liquidoDaEntrega = { gerente_id: GERENTE_ID, venda_id: 30505, liquido: 40 };
    saldoGeralDaGerente = -185.64;

    await cancelarEntrega(ENTREGA_ID, USER_ID);

    const inserts = insertsDeSaldo();
    expect(inserts).toHaveLength(1);
    const [gerente, tipo, valor, saldoAntes, saldoDepois, entregaId, vendaId, descricao] =
      inserts[0].valores;
    expect(gerente).toBe(GERENTE_ID);
    expect(tipo).toBe("debito");
    expect(valor).toBe(40);
    expect(saldoAntes).toBe(-185.64);
    // Estorno do crédito derruba o saldo de volta.
    expect(saldoDepois).toBe(-225.64);
    expect(entregaId).toBe(ENTREGA_ID);
    expect(vendaId).toBe(30505);
    expect(String(descricao)).toContain("Estorno");
  });

  it("P2 — entrega que debitou vira contra-lançamento de crédito", async () => {
    liquidoDaEntrega = { gerente_id: GERENTE_ID, venda_id: 30509, liquido: -20 };
    saldoGeralDaGerente = -100;

    await cancelarEntrega(ENTREGA_ID, USER_ID);

    const inserts = insertsDeSaldo();
    expect(inserts).toHaveLength(1);
    const [, tipo, valor, saldoAntes, saldoDepois] = inserts[0].valores;
    expect(tipo).toBe("credito");
    expect(valor).toBe(20);
    expect(saldoAntes).toBe(-100);
    // Estorno do débito devolve o valor.
    expect(saldoDepois).toBe(-80);
  });

  it("P3 — líquido zero (já estornada) não grava lançamento nenhum", async () => {
    liquidoDaEntrega = { gerente_id: GERENTE_ID, venda_id: 30505, liquido: 0 };
    saldoGeralDaGerente = -185.64;

    await cancelarEntrega(ENTREGA_ID, USER_ID);

    expect(insertsDeSaldo()).toHaveLength(0);
  });

  it("P4 — entrega sem lançamento de frete não grava nada e não quebra", async () => {
    liquidoDaEntrega = undefined;

    await expect(cancelarEntrega(ENTREGA_ID, USER_ID)).resolves.toBeUndefined();

    expect(insertsDeSaldo()).toHaveLength(0);
  });

  it("P5 — o lançamento original nunca é apagado nem editado", async () => {
    liquidoDaEntrega = { gerente_id: GERENTE_ID, venda_id: 30505, liquido: 40 };

    await cancelarEntrega(ENTREGA_ID, USER_ID);

    const mexeuNoOriginal = queries.some(
      (q) =>
        /saldo_frete_gratis/.test(q.texto) && /^\s*(DELETE|UPDATE)/i.test(q.texto.trim()),
    );
    expect(mexeuNoOriginal).toBe(false);
  });

  it("continua barrando cancelamento de entrega que não está pendente", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: ENTREGA_ID, situacao: "confirmada", codigo_entrega: "ENT-20260731-00013" },
    ]);

    await expect(cancelarEntrega(ENTREGA_ID, USER_ID)).rejects.toThrow(
      /Apenas entregas pendentes/,
    );
    expect(sqlMock.begin).not.toHaveBeenCalled();
  });
});
