/**
 * Testes ANTI-VOLTA de criarFreteAvulso (src/lib/entrega-venda.ts) — BLOCO 3.
 *
 * O QUE COBRE (a parte que vive na LIB, não na rota — ver
 * frete-avulso-invariantes-route.test.ts para a checagem de ownership):
 *
 *  P1 — janela de situações e guard de duplicata COM venda passam a valer
 *    SEMPRE que há `vendaId`, independente de `modoSolicitacao`. Antes só
 *    rodavam dentro de `if (params.modoSolicitacao)` — a criação DIRETA
 *    conseguia gravar um frete avulso pra uma venda rascunho/cancelada, ou
 *    duplicar por cima de uma solicitação já pendente pra mesma venda.
 *
 *  P2 — guard de duplicata SEM venda (não existia antes): mesmo autor +
 *    mesma descrição + situação aberta + janela de 5 minutos. Prova que o
 *    2º envio idêntico é barrado ANTES de abrir a transação (sql.begin nunca
 *    roda — sem isso teria 2 corridas/2 lançamentos de saldo).
 *
 * Estratégia de mock: `sql` mockado como função de template tag (mesma
 * assinatura de uso no código) + `.array`/`.begin` — `begin` rejeita com um
 * erro-sentinela (SENTINEL_REACHED_TX) só pra provar que o fluxo CHEGOU lá
 * (passou pelos guards) sem precisar simular o INSERT inteiro, que envolve
 * gerarCodigoEntrega, logAudit, upload de comprovante etc. (fora do escopo
 * deste teste, que é só o PORTÃO de entrada).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SENTINEL = "SENTINEL_REACHED_TX";

const sqlMock = Object.assign(
  vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[])),
  {
    array: (arr: unknown[]) => arr,
    begin: vi.fn(() => Promise.reject(new Error(SENTINEL))),
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

const { criarFreteAvulso } = await import("@/lib/entrega-venda");

const USER_ID = "22222222-2222-2222-2222-222222222222";

function paramsBase(extra: Record<string, unknown> = {}) {
  return {
    regiao: "fortaleza" as const,
    freteCobrado: 15,
    descricaoAvulso: "Buscar peça na fábrica",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin = vi.fn(() => Promise.reject(new Error(SENTINEL)));
});

describe("P1 — janela e duplicata COM venda valem SEMPRE, independente do modo", () => {
  it("modo DIRETO (modoSolicitacao=false) + venda em 'rascunho' → barrado pela janela (mesma regra da solicitação)", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 500, numero_venda: "V500", situacao: "rascunho" }]);

    await expect(
      criarFreteAvulso(paramsBase({ vendaId: 500, modoSolicitacao: false }), USER_ID),
    ).rejects.toThrow(/não está numa situação que permite frete avulso vinculado/);

    expect((sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin).not.toHaveBeenCalled();
  });

  it("modo DIRETO + venda 'aprovado' MAS já tem solicitação 'solicitada' pendente pra mesma venda → barrado (fecha o desvio de furar o pool)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 501, numero_venda: "V501", situacao: "aprovado" }]) // SELECT venda
      .mockResolvedValueOnce([{ id: 9001 }]); // SELECT duplicata (já solicitada)

    await expect(
      criarFreteAvulso(paramsBase({ vendaId: 501, modoSolicitacao: false }), USER_ID),
    ).rejects.toThrow(/já existe uma solicitação de frete avulso aguardando decisão/i);

    expect((sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin).not.toHaveBeenCalled();
  });

  it("modo DIRETO + venda 'aprovado' SEM solicitação pendente → passa dos guards e chega na transação (sentinela)", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 502, numero_venda: "V502", situacao: "aprovado" }]) // SELECT venda
      .mockResolvedValueOnce([]); // SELECT duplicata: nada encontrado

    await expect(
      criarFreteAvulso(paramsBase({ vendaId: 502, modoSolicitacao: false }), USER_ID),
    ).rejects.toThrow(SENTINEL);
  });
});

describe("P2 — guard de duplicata SEM venda (não existia antes do BLOCO 3)", () => {
  it("2º envio idêntico (mesmo autor + mesma descrição + situação aberta + janela de 5min) → barrado com mensagem clara, transação NUNCA abre", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 8001 }]); // guard sem venda: encontrou duplicata

    await expect(
      criarFreteAvulso(paramsBase({ modoSolicitacao: false }), USER_ID),
    ).rejects.toThrow(/já existe uma corrida avulsa igual/i);

    expect((sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin).not.toHaveBeenCalled();

    // Prova que o critério usado é created_by + descricao_avulso (não é um
    // guard "qualquer corrida recente" — duas pessoas ou duas descrições
    // diferentes não colidem).
    const [, ...values] = sqlMock.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(values).toContain(USER_ID);
    expect(values).toContain("Buscar peça na fábrica");
  });

  it("SEM duplicata recente → passa do guard e chega na transação (sentinela) — corrida legítima não é barrada", async () => {
    sqlMock.mockResolvedValueOnce([]); // guard sem venda: nada encontrado

    await expect(
      criarFreteAvulso(paramsBase({ modoSolicitacao: false }), USER_ID),
    ).rejects.toThrow(SENTINEL);
  });

  it("também vale pro auto-registro do entregador (modoSolicitacao=undefined, sem venda) — mesmo guard", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 8002 }]); // guard: encontrou duplicata

    await expect(
      criarFreteAvulso(
        { regiao: "fortaleza", freteCobrado: 10, descricaoAvulso: "Corrida entregador" },
        USER_ID,
      ),
    ).rejects.toThrow(/já existe uma corrida avulsa igual/i);
  });
});
