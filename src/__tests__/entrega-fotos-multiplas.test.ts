/**
 * Testes ANTI-VOLTA — MULTIFOTO na confirmação de entrega (migration 357).
 *
 * O QUE COBRE:
 *   1. Finalizar SEM foto continua funcionando (fotos são opcionais).
 *   2. Finalizar COM N fotos grava N registros (entregas_venda_fotos) e o
 *      helper buscarFotosEntrega devolve todas.
 *   3. Entrega antiga (só foto_entrega_path, sem linha na tabela nova)
 *      continua aparecendo pelo MESMO helper (fallback).
 *   4. ORDEM INVIOLÁVEL (alerta Jonathan, 21/07): em confirmarEntrega (entrega
 *      de PEDIDO — usa código A/B), um código INVÁLIDO rejeita a confirmação
 *      SEM jamais processar fotos — a foto nunca é condição, nunca antecipa,
 *      nunca substitui a checagem do código. Prova: uploadFile nunca chamado
 *      e a transação (sql.begin) nunca abre quando o código está errado.
 *
 * Estratégia de mock: `sql` como função de template tag + `.begin` executando
 * o callback com o próprio mock como `tx` (mesmo padrão de
 * aprovacao-frete-avulso-atomicidade.test.ts). Um `mockResolvedValue([])`
 * "blanket" cobre todas as queries que não importam pro teste (itens vazios,
 * bloqueio de reposição vazio, etc.) — só a 1ª chamada (SELECT da entrega) é
 * fixada com `mockResolvedValueOnce` por teste, o que também evita depender
 * de contar manualmente cada query de baixarEstoqueDaEntrega/logAudit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = Object.assign(
  vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[])),
  {
    begin: vi.fn((fn: (tx: unknown) => unknown) => fn(sqlMock)),
  },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));

const mockUploadFile = vi.fn();
vi.mock("@/lib/storage", () => ({ uploadFile: (...args: unknown[]) => mockUploadFile(...args) }));

vi.mock("@/lib/whatsapp", () => ({
  enviarCodigoWhatsAppDetalhado: vi.fn(),
  enviarCodigoClienteEmRota: vi.fn(),
  enviarConfirmacaoEntregaConcluida: vi.fn(),
  enviarAvisoDesenvolvedor: vi.fn(),
}));

const { confirmarEntrega, confirmarFreteAvulso, buscarFotosEntrega } =
  await import("@/lib/entrega-venda");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ENTREGA_ID = 42;

/** Linha base da entrega avulsa (confirmarFreteAvulso). */
function entregaAvulsaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTREGA_ID,
    situacao: "em_rota",
    codigo_entrega: "ENT-AVULSO-1",
    is_avulso: true,
    motoboy_id: USER_ID,
    created_by: "loja-uuid",
    ...overrides,
  };
}

/** Linha base da entrega de PEDIDO (confirmarEntrega — código A/B). */
function entregaPedidoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTREGA_ID,
    situacao: "pendente",
    codigo_entrega: "ENT-PEDIDO-1",
    codigo_cliente: "111111",
    codigo_motoboy: "222222",
    codigo_bloqueado_em: null,
    tentativas_codigo: 0,
    is_avulso: false,
    venda_id: 900,
    forma_entrega: "motoboy",
    data_saida: null,
    data_retirada: null,
    data_entrega_realizada: null,
    ...overrides,
  };
}

/** Acha, entre as chamadas do mock, o INSERT em entregas_venda_fotos —
 * é a chamada em que o 1º argumento é o array de linhas (helper `tx(rows)`
 * do postgres.js), reconhecível pela chave `foto_path`. */
function acharInsertFotos() {
  return sqlMock.mock.calls.find(
    (args) => Array.isArray(args[0]) && (args[0] as Array<Record<string, unknown>>)[0]?.foto_path,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]); // blanket — cobre queries irrelevantes ao teste
  (sqlMock as unknown as { begin: ReturnType<typeof vi.fn> }).begin = vi.fn(
    (fn: (tx: unknown) => unknown) => fn(sqlMock),
  );
  mockUploadFile.mockReset();
});

// ── 1. Corrida avulsa (confirmarFreteAvulso) ────────────────────────────────

describe("confirmarFreteAvulso — fotos opcionais (migration 357)", () => {
  it("SEM fotos: finaliza normalmente, uploadFile nunca é chamado", async () => {
    sqlMock.mockResolvedValueOnce([entregaAvulsaRow()]);

    await expect(confirmarFreteAvulso(ENTREGA_ID, USER_ID)).resolves.toBeUndefined();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(acharInsertFotos()).toBeUndefined();
  });

  it("COM N fotos: chama uploadFile N vezes e grava N linhas em entregas_venda_fotos", async () => {
    sqlMock.mockResolvedValueOnce([entregaAvulsaRow()]);
    mockUploadFile
      .mockResolvedValueOnce({ url: "/api/storage/pagamento-fotos/entregas/42/x-0.jpg", path: "entregas/42/x-0.jpg" })
      .mockResolvedValueOnce({ url: "/api/storage/pagamento-fotos/entregas/42/x-1.jpg", path: "entregas/42/x-1.jpg" });

    await confirmarFreteAvulso(ENTREGA_ID, USER_ID, [
      "data:image/jpeg;base64,AAA",
      "data:image/jpeg;base64,BBB",
    ]);

    expect(mockUploadFile).toHaveBeenCalledTimes(2);
    const chamada = acharInsertFotos();
    expect(chamada).toBeTruthy();
    const rows = chamada![0] as Array<{ entrega_id: number; foto_path: string; criado_por_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entrega_id: ENTREGA_ID, foto_path: "entregas/42/x-0.jpg", criado_por_id: USER_ID });
    expect(rows[1]).toMatchObject({ entrega_id: ENTREGA_ID, foto_path: "entregas/42/x-1.jpg", criado_por_id: USER_ID });
  });

  it("upload falha (Storage indisponível) → best-effort, finalização NÃO é bloqueada", async () => {
    sqlMock.mockResolvedValueOnce([entregaAvulsaRow()]);
    mockUploadFile.mockResolvedValueOnce({ error: "Storage indisponível" });

    await expect(
      confirmarFreteAvulso(ENTREGA_ID, USER_ID, ["data:image/jpeg;base64,AAA"]),
    ).resolves.toBeUndefined();
    expect(acharInsertFotos()).toBeUndefined(); // nenhuma foto válida pra gravar
  });

  it("guard de estado (corrida ainda não aceita) falha ANTES de qualquer upload, mesmo com fotos anexadas", async () => {
    // pendente + created_by != motoboy_id → não é auto-registrada → não pode confirmar ainda
    sqlMock.mockResolvedValueOnce(
      [entregaAvulsaRow({ situacao: "pendente", created_by: "outra-pessoa-uuid" })],
    );

    await expect(
      confirmarFreteAvulso(ENTREGA_ID, USER_ID, ["data:image/jpeg;base64,AAA"]),
    ).rejects.toThrow(/precisa aceitar a corrida/);
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(sqlMock.begin).not.toHaveBeenCalled();
  });
});

// ── 2. Entrega de pedido (confirmarEntrega — código A/B) ────────────────────

describe("confirmarEntrega — ordem inviolável: código validado ANTES de qualquer foto", () => {
  it("código INVÁLIDO + fotos fornecidas → rejeita como sempre, fotos NUNCA são processadas", async () => {
    sqlMock.mockResolvedValueOnce([entregaPedidoRow()]);

    await expect(
      confirmarEntrega(ENTREGA_ID, "000000", USER_ID, ["data:image/jpeg;base64,AAA"]),
    ).rejects.toThrow(/Código inválido/);

    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(sqlMock.begin).not.toHaveBeenCalled();
    expect(acharInsertFotos()).toBeUndefined();
  });

  it("código do motoboy (B) válido, SEM fotos → confirma normalmente (fotos continuam opcionais)", async () => {
    sqlMock.mockResolvedValueOnce([entregaPedidoRow()]);

    const resultado = await confirmarEntrega(ENTREGA_ID, "222222", USER_ID);

    expect(resultado.etapa).toBe("retirada_loja");
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("código do motoboy (B) válido + N fotos → confirma e grava as fotos DEPOIS do código aprovado", async () => {
    sqlMock.mockResolvedValueOnce([entregaPedidoRow()]);
    mockUploadFile
      .mockResolvedValueOnce({ url: "/api/storage/pagamento-fotos/entregas/42/y-0.jpg", path: "entregas/42/y-0.jpg" })
      .mockResolvedValueOnce({ url: "/api/storage/pagamento-fotos/entregas/42/y-1.jpg", path: "entregas/42/y-1.jpg" });

    const resultado = await confirmarEntrega(ENTREGA_ID, "222222", USER_ID, [
      "data:image/jpeg;base64,AAA",
      "data:image/jpeg;base64,BBB",
    ]);

    expect(resultado.etapa).toBe("retirada_loja");
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
    const chamada = acharInsertFotos();
    expect(chamada).toBeTruthy();
    const rows = chamada![0] as Array<{ entrega_id: number; foto_path: string; criado_por_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.entrega_id === ENTREGA_ID && r.criado_por_id === USER_ID)).toBe(true);
  });
});

// ── 3. Helper único de leitura (buscarFotosEntrega) ─────────────────────────

describe("buscarFotosEntrega — helper único (tabela nova + fallback pra coluna antiga)", () => {
  it("devolve as fotos já resolvidas pela query (tabela nova OU fallback — o COALESCE é do SQL)", async () => {
    sqlMock.mockResolvedValueOnce([{ fotos: ["entregas/1/a.jpg", "entregas/1/b.jpg"] }]);
    await expect(buscarFotosEntrega(1)).resolves.toEqual(["entregas/1/a.jpg", "entregas/1/b.jpg"]);
  });

  it("entrega ANTIGA (só foto_entrega_path, sem linha na tabela nova) → helper devolve a foto única via fallback", async () => {
    // Simula o que o SQL do helper devolveria: sem linha em entregas_venda_fotos,
    // o COALESCE cai no CASE da coluna antiga — aqui só validamos que o JS
    // repassa fielmente o que veio da query (a regra de fallback é do SQL,
    // já comentada e revisada na migration 357 / função buscarFotosEntrega).
    sqlMock.mockResolvedValueOnce([{ fotos: ["entregas/2/legado.jpg"] }]);
    await expect(buscarFotosEntrega(2)).resolves.toEqual(["entregas/2/legado.jpg"]);
  });

  it("sem foto nenhuma (nem tabela nem coluna antiga) → array vazio", async () => {
    sqlMock.mockResolvedValueOnce([{ fotos: [] }]);
    await expect(buscarFotosEntrega(3)).resolves.toEqual([]);
  });

  it("entrega não encontrada → array vazio (não lança)", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(buscarFotosEntrega(999)).resolves.toEqual([]);
  });
});
