/**
 * Testes de `fecharContaReceberAposPagamentoMp` — o fechamento da parcela do
 * crediário quando o webhook do Mercado Pago confirma o pagamento do QR Pix /
 * maquininha gerados na tela do Crediário.
 *
 * POR QUE ESTE ARQUIVO EXISTE: até 06/08/2026 esta função era **código morto**
 * — nenhuma rota a importava, apesar de `cobrar-pix`, `cobrar-cartao` e o
 * CrediarioClient afirmarem em comentário que "o webhook fecha a conta". Em
 * produção o cliente pagava, o pagamento era confirmado e a parcela ficava
 * aberta para sempre: o cron seguia cobrando quem já tinha pago (vendas 15769
 * e 15312 — contas fechadas na mão pelo log 402).
 *
 * NÃO REMOVER: é a rede de proteção dos dois comportamentos que o passivo
 * mostrou serem necessários — fechar a parcela CERTA e dividir o "A Receber"
 * quando o crediário é parcelado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreditarSaldo = vi.fn();
vi.mock("@/lib/saldo-credito", () => ({
  creditarSaldo: (...args: unknown[]) => mockCreditarSaldo(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { fecharContaReceberAposPagamentoMp } = await import("@/lib/crediario-baixa-automatica");

const VENDA_ID = 30295;
const PAGAMENTO_ID = 1059;
const CONTA_ID = 702;
const USER = "00000000-0000-0000-0000-000000000001";

interface Chamada { sql: string; vals: unknown[] }

/**
 * Fake do `tx` do postgres.js: responde por trecho de SQL e grava a ordem das
 * chamadas (a ordem importa — reduzir o confirmado ANTES de inserir o pendente).
 */
function makeTx(opts: { conta?: Record<string, unknown> | null; pagamentoValor?: string; creditoGerente?: string }) {
  const chamadas: Chamada[] = [];
  const tx = vi.fn((tpl: TemplateStringsArray, ...vals: unknown[]) => {
    const sqlTexto = Array.from(tpl).join(" ");
    chamadas.push({ sql: sqlTexto, vals });

    if (sqlTexto.includes("FROM alissonerp.contas_receber")) {
      return Promise.resolve(opts.conta === null ? [] : [opts.conta ?? { id: CONTA_ID, valor: "9000", situacao: "pendente" }]);
    }
    if (sqlTexto.includes("FROM alissonerp.pagamentos_venda")) {
      return Promise.resolve([{ id: PAGAMENTO_ID, valor: opts.pagamentoValor ?? "9000" }]);
    }
    if (sqlTexto.includes("credito_gerente_usado FROM alissonerp.vendas_erp")) {
      return Promise.resolve([{ credito_gerente_usado: opts.creditoGerente ?? "0" }]);
    }
    return Promise.resolve([]);
  });
  return { tx, chamadas };
}

const base = {
  vendaId: VENDA_ID,
  pagamentoId: PAGAMENTO_ID,
  formaPagamento: "A Receber",
  valorPago: 9000,
  usuarioId: USER,
};

const achar = (c: Chamada[], ...trechos: string[]) =>
  c.findIndex((x) => trechos.every((t) => x.sql.includes(t)));

describe("fecharContaReceberAposPagamentoMp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignora pagamento que não é crediário (venda à vista) sem tocar no banco", async () => {
    const { tx, chamadas } = makeTx({});
    const r = await fecharContaReceberAposPagamentoMp(tx, { ...base, formaPagamento: "Pix" });
    expect(r.fechou).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("é no-op quando não há parcela pendente (idempotente)", async () => {
    const { tx, chamadas } = makeTx({ conta: null });
    const r = await fecharContaReceberAposPagamentoMp(tx, base);
    expect(r.fechou).toBe(false);
    expect(achar(chamadas, "UPDATE alissonerp.contas_receber")).toBe(-1);
  });

  it("fecha a parcela que a cobrança mirava, não a mais antiga", async () => {
    const { tx, chamadas } = makeTx({});
    await fecharContaReceberAposPagamentoMp(tx, { ...base, contaReceberId: CONTA_ID });

    const idx = achar(chamadas, "FROM alissonerp.contas_receber");
    expect(chamadas[idx].sql).toContain("WHERE id =");
    expect(chamadas[idx].sql).not.toContain("ORDER BY id");
    expect(chamadas[idx].vals).toContain(CONTA_ID);
  });

  it("sem a referência da parcela, cai na mais antiga em aberto", async () => {
    const { tx, chamadas } = makeTx({});
    await fecharContaReceberAposPagamentoMp(tx, base);

    const idx = achar(chamadas, "FROM alissonerp.contas_receber");
    expect(chamadas[idx].sql).toContain("ORDER BY id");
  });

  it("crediário PARCELADO: divide o A Receber em vez de deixar tudo confirmado", async () => {
    // A Receber de R$ 36.000 (4×), QR cobrou a parcela de R$ 9.000.
    const { tx, chamadas } = makeTx({ pagamentoValor: "36000" });

    const r = await fecharContaReceberAposPagamentoMp(tx, { ...base, contaReceberId: CONTA_ID });

    expect(r.fechou).toBe(true);
    expect(r.splitPagamento).toBe(true);
    expect(r.restanteAReceber).toBe(27000);

    const idxUpdate = achar(chamadas, "UPDATE alissonerp.pagamentos_venda", "SET valor");
    const idxInsert = achar(chamadas, "INSERT INTO alissonerp.pagamentos_venda", "A Receber");
    expect(idxUpdate).toBeGreaterThanOrEqual(0);
    expect(chamadas[idxUpdate].vals).toContain(9000);
    expect(chamadas[idxInsert].vals).toContain(27000);
    // ⚠️ Reduzir ANTES de inserir: ao contrário, a soma passa do total_venda e o
    // trigger fn_pagamento_nao_exceder_total derruba a transação do webhook.
    expect(idxInsert).toBeGreaterThan(idxUpdate);
  });

  it("crediário de 1 parcela: fecha a conta e NÃO mexe no pagamento", async () => {
    const { tx, chamadas } = makeTx({ pagamentoValor: "9000" });

    const r = await fecharContaReceberAposPagamentoMp(tx, base);

    expect(r.fechou).toBe(true);
    expect(r.splitPagamento).toBeUndefined();
    expect(achar(chamadas, "INSERT INTO alissonerp.pagamentos_venda")).toBe(-1);
    expect(achar(chamadas, "UPDATE alissonerp.pagamentos_venda", "SET valor")).toBe(-1);
  });

  it("registra a baixa na timeline do crediário", async () => {
    const { tx, chamadas } = makeTx({});
    await fecharContaReceberAposPagamentoMp(tx, base);
    expect(achar(chamadas, "INSERT INTO alissonerp.comunicacoes_crediario")).toBeGreaterThanOrEqual(0);
  });

  it("devolve ao gerente só o que entrou, quando a venda usou crédito", async () => {
    const { tx } = makeTx({ creditoGerente: "50000" });
    const r = await fecharContaReceberAposPagamentoMp(tx, base);

    expect(r.saldoDevolvido).toBe(true);
    expect(mockCreditarSaldo).toHaveBeenCalledWith(9000, VENDA_ID, PAGAMENTO_ID, USER, tx);
  });
});
