/**
 * Testes da rota POST /api/financeiro/upload-ofx
 *
 * Comportamentos testados:
 *   - Auth (401) e permissão de role (403)
 *   - Body sem arquivo (400) e arquivo > 10MB (400)
 *   - OFX sem transações (400)
 *   - OFX com transações: cria extrato + insere lançamentos
 *   - Deduplicação por fitid (ON CONFLICT DO NOTHING)
 *   - Tipos D (débito) e C (crédito) preservados
 *   - Resposta com extrato_id, total_transacoes, inseridos, duplicados, banco, conta
 *
 * Nota: a rota NÃO usa transação (sql.begin); cada INSERT é independente.
 *       A rota também não trata erros de parseOFX em try/catch — exceção propaga.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock)),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const parseOFXMock = vi.fn();
vi.mock("@/lib/ofx-parser", () => ({
  parseOFX: (text: string) => parseOFXMock(text),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const routeModule = await import("@/app/api/financeiro/upload-ofx/route");
const POST = routeModule.POST;
const GET = (routeModule as Record<string, unknown>).GET;
const PUT = (routeModule as Record<string, unknown>).PUT;
const PATCH = (routeModule as Record<string, unknown>).PATCH;
const DELETE = (routeModule as Record<string, unknown>).DELETE;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

/**
 * Monta um NextRequest com FormData contendo um File.
 * Quando `file` é null, monta o FormData sem o campo "arquivo".
 */
function makeRequest(opts?: {
  file?: { content: string; name?: string; size?: number } | null;
}) {
  const fd = new FormData();
  if (opts?.file) {
    const { content, name = "extrato.ofx", size } = opts.file;
    let blob: Blob;
    if (size !== undefined) {
      // Cria um blob com o tamanho desejado (preenchido com '0')
      blob = new Blob([new Uint8Array(size)], { type: "application/x-ofx" });
    } else {
      blob = new Blob([content], { type: "application/x-ofx" });
    }
    const file = new File([blob], name, { type: "application/x-ofx" });
    fd.append("arquivo", file);
  }
  // Quando file === null, NÃO adiciona o campo "arquivo"
  return new NextRequest("http://localhost/api/financeiro/upload-ofx", {
    method: "POST",
    body: fd,
  });
}

function makeOFXResult(opts?: {
  banco?: string;
  agencia?: string;
  conta?: string;
  data_inicio?: string;
  data_fim?: string;
  transacoes?: Array<{
    fitid: string;
    tipo: "C" | "D";
    valor: number;
    data_transacao: string;
    descricao: string;
  }>;
}) {
  return {
    banco: opts?.banco ?? "001",
    agencia: opts?.agencia ?? "1234",
    conta: opts?.conta ?? "56789-0",
    data_inicio: opts?.data_inicio ?? "2026-04-01",
    data_fim: opts?.data_fim ?? "2026-04-30",
    transacoes: opts?.transacoes ?? [],
  };
}

/**
 * Helper que monta o pipeline padrão de mocks de SQL para um POST bem-sucedido:
 *   1. SELECT role from usuarios → role autorizada
 *   2. INSERT extrato → retorna { id }
 *   3. N x INSERT lançamento com RETURNING id
 */
function mockSqlHappyPath(opts?: {
  role?: string;
  extratoId?: number;
  insertedIds?: Array<number | null>; // null = duplicata (ON CONFLICT DO NOTHING)
}) {
  const insertedIds = opts?.insertedIds ?? [];
  sqlMock.mockResolvedValueOnce([{ role: opts?.role ?? "admin" }]); // SELECT role
  sqlMock.mockResolvedValueOnce([{ id: opts?.extratoId ?? 42 }]); // INSERT extrato
  for (const id of insertedIds) {
    sqlMock.mockResolvedValueOnce(id === null ? [] : [{ id }]); // INSERT lançamento
  }
}

// ── Sanidade de exports ───────────────────────────────────────────────────────

describe("Exports do módulo /api/financeiro/upload-ofx", () => {
  it("exporta POST", () => {
    expect(typeof POST).toBe("function");
  });

  it.each(["GET", "PUT", "PATCH", "DELETE"])(
    "não exporta %s (não implementado)",
    (verb) => {
      const map: Record<string, unknown> = { GET, PUT, PATCH, DELETE };
      expect(map[verb]).toBeUndefined();
    },
  );
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/financeiro/upload-ofx", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({ file: { content: "x" } }));
    expect(res.status).toBe(401);
  });

  it("não chama sql quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await POST(makeRequest({ file: { content: "x" } }));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("não chama parseOFX quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await POST(makeRequest({ file: { content: "x" } }));
    expect(parseOFXMock).not.toHaveBeenCalled();
  });

  // ── Permissão ───────────────────────────────────────────────────────────────

  it.each([
    "consultora",
    "motoboy",
    "ourives",
    "pcp",
    "estoquista_loja",
  ])("retorna 403 quando role é %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await POST(makeRequest({ file: { content: "x" } }));
    expect(res.status).toBe(403);
  });

  it("retorna 403 quando usuário não está cadastrado em alissonerp.usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(makeRequest({ file: { content: "x" } }));
    expect(res.status).toBe(403);
  });

  it.each([
    "desenvolvedor",
    "admin",
    "gerente_fabrica",
    "gerente_loja",
  ])("aceita role %s", async (role) => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ role, insertedIds: [1] });
    const res = await POST(makeRequest({ file: { content: "ofx-data" } }));
    expect(res.status).toBe(201);
  });

  it("aceita role 'diretor' (full access via isFullAccess)", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ role: "diretor", insertedIds: [1] });
    const res = await POST(makeRequest({ file: { content: "ofx-data" } }));
    expect(res.status).toBe(201);
  });

  // ── Validação de arquivo ────────────────────────────────────────────────────

  it("retorna 400 quando o campo 'arquivo' não está presente", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(makeRequest({ file: null }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/obrigat/i);
  });

  it("retorna 400 quando arquivo > 10MB", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(
      makeRequest({ file: { content: "", size: 10 * 1024 * 1024 + 1 } }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/grande|10MB/i);
  });

  it("aceita arquivo com exatamente 10MB", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1] });
    const res = await POST(
      makeRequest({ file: { content: "x", size: 10 * 1024 * 1024 } }),
    );
    // 10MB exato passa (limite é > 10MB)
    expect(res.status).toBe(201);
  });

  // ── OFX parse ───────────────────────────────────────────────────────────────

  it("retorna 400 quando OFX não tem transações", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    parseOFXMock.mockReturnValueOnce(makeOFXResult({ transacoes: [] }));
    const res = await POST(makeRequest({ file: { content: "ofx-vazio" } }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/transa/i);
  });

  it("não cria extrato quando OFX vazio (não chama INSERT)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    parseOFXMock.mockReturnValueOnce(makeOFXResult({ transacoes: [] }));
    await POST(makeRequest({ file: { content: "ofx-vazio" } }));
    // 1 chamada apenas (SELECT role); nenhum INSERT
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("retorna 422 quando parseOFX lança exceção (try/catch protege)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    parseOFXMock.mockImplementationOnce(() => {
      throw new Error("Arquivo OFX muito grande (máximo 10MB)");
    });
    const res = await POST(makeRequest({ file: { content: "x" } }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/OFX/i);
  });

  // ── Sucesso: 1 transação ────────────────────────────────────────────────────

  it("cria extrato e insere 1 lançamento com sucesso", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        banco: "341",
        agencia: "0001",
        conta: "12345-6",
        data_inicio: "2026-04-01",
        data_fim: "2026-04-30",
        transacoes: [
          {
            fitid: "FIT-001",
            tipo: "C",
            valor: 100.5,
            data_transacao: "2026-04-10",
            descricao: "Depósito",
          },
        ],
      }),
    );
    mockSqlHappyPath({ extratoId: 42, insertedIds: [101] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      ok: true,
      extrato_id: 42,
      total_transacoes: 1,
      inseridos: 1,
      duplicados: 0,
      banco: "341",
      conta: "12345-6",
    });
  });

  it("INSERT extrato envia banco, agencia, conta, data_inicio, data_fim, arquivo_nome, processado=true, created_by", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        banco: "341",
        agencia: "0001",
        conta: "12345-6",
        data_inicio: "2026-04-01",
        data_fim: "2026-04-30",
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ extratoId: 42, insertedIds: [101] });
    await POST(
      makeRequest({ file: { content: "ofx", name: "extrato-abril.ofx" } }),
    );

    // Chamada [1] = INSERT extrato
    const extratoCall = sqlMock.mock.calls[1];
    const sqlText = (extratoCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/INSERT\s+INTO\s+alissonerp\.fin_extratos_bancarios/i);
    expect(sqlText).toMatch(/banco/i);
    expect(sqlText).toMatch(/agencia/i);
    expect(sqlText).toMatch(/conta/i);
    expect(sqlText).toMatch(/data_inicio/i);
    expect(sqlText).toMatch(/data_fim/i);
    expect(sqlText).toMatch(/arquivo_nome/i);
    expect(sqlText).toMatch(/created_by/i);
    expect(sqlText).toMatch(/processado/i);
    expect(sqlText).toMatch(/RETURNING\s+id/i);

    const values = extratoCall.slice(1);
    expect(values).toContain("341");
    expect(values).toContain("0001");
    expect(values).toContain("12345-6");
    expect(values).toContain("2026-04-01");
    expect(values).toContain("2026-04-30");
    expect(values).toContain("extrato-abril.ofx");
  });

  it("INSERT lançamento envia extrato_id, fitid, tipo, valor, data_transacao, descricao, conciliado", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          {
            fitid: "FIT-XYZ",
            tipo: "D",
            valor: 250.75,
            data_transacao: "2026-04-15",
            descricao: "PIX enviado",
          },
        ],
      }),
    );
    mockSqlHappyPath({ extratoId: 99, insertedIds: [201] });
    await POST(makeRequest({ file: { content: "ofx" } }));

    // Chamada [2] = INSERT lançamento
    const lancCall = sqlMock.mock.calls[2];
    const sqlText = (lancCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/INSERT\s+INTO\s+alissonerp\.fin_lancamentos_bancarios/i);
    expect(sqlText).toMatch(/extrato_id/i);
    expect(sqlText).toMatch(/fitid/i);
    expect(sqlText).toMatch(/tipo/i);
    expect(sqlText).toMatch(/valor/i);
    expect(sqlText).toMatch(/data_transacao/i);
    expect(sqlText).toMatch(/descricao/i);
    expect(sqlText).toMatch(/conciliado/i);
    expect(sqlText).toMatch(/ON\s+CONFLICT\s*\(\s*fitid\s*\)\s*DO\s+NOTHING/i);
    expect(sqlText).toMatch(/RETURNING\s+id/i);

    const values = lancCall.slice(1);
    expect(values).toContain(99); // extrato_id
    expect(values).toContain("FIT-XYZ");
    expect(values).toContain("D");
    expect(values).toContain(250.75);
    expect(values).toContain("2026-04-15");
    expect(values).toContain("PIX enviado");
  });

  // ── Múltiplas transações ────────────────────────────────────────────────────

  it("insere N lançamentos (uma chamada SQL por transação)", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "a" },
          { fitid: "F2", tipo: "D", valor: 20, data_transacao: "2026-04-11", descricao: "b" },
          { fitid: "F3", tipo: "C", valor: 30, data_transacao: "2026-04-12", descricao: "c" },
        ],
      }),
    );
    mockSqlHappyPath({ extratoId: 42, insertedIds: [101, 102, 103] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    expect(res.status).toBe(201);
    // 1 SELECT role + 1 INSERT extrato + 3 INSERT lançamento = 5
    expect(sqlMock).toHaveBeenCalledTimes(5);
    const data = await res.json();
    expect(data.inseridos).toBe(3);
    expect(data.duplicados).toBe(0);
    expect(data.total_transacoes).toBe(3);
  });

  // ── Deduplicação por fitid ──────────────────────────────────────────────────

  it("conta duplicados quando ON CONFLICT retorna 0 linhas", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "a" },
          { fitid: "F2", tipo: "D", valor: 20, data_transacao: "2026-04-11", descricao: "b" },
          { fitid: "F3", tipo: "C", valor: 30, data_transacao: "2026-04-12", descricao: "c" },
        ],
      }),
    );
    // F1 inserido, F2 duplicado, F3 inserido
    mockSqlHappyPath({ insertedIds: [101, null, 103] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    const data = await res.json();
    expect(data.inseridos).toBe(2);
    expect(data.duplicados).toBe(1);
    expect(data.total_transacoes).toBe(3);
  });

  it("todos duplicados: inseridos=0, duplicados=N", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "a" },
          { fitid: "F2", tipo: "D", valor: 20, data_transacao: "2026-04-11", descricao: "b" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [null, null] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.inseridos).toBe(0);
    expect(data.duplicados).toBe(2);
  });

  // ── Tipos C e D preservados ─────────────────────────────────────────────────

  it("preserva tipo C (crédito) e D (débito) no INSERT", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "C1", tipo: "C", valor: 100, data_transacao: "2026-04-10", descricao: "credito" },
          { fitid: "D1", tipo: "D", valor: 50, data_transacao: "2026-04-11", descricao: "debito" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1, 2] });
    await POST(makeRequest({ file: { content: "ofx" } }));

    // Chamada [2] = primeira INSERT lançamento (C)
    const call1 = sqlMock.mock.calls[2];
    expect(call1.slice(1)).toContain("C");
    expect(call1.slice(1)).toContain(100);
    expect(call1.slice(1)).toContain("credito");

    // Chamada [3] = segunda INSERT lançamento (D)
    const call2 = sqlMock.mock.calls[3];
    expect(call2.slice(1)).toContain("D");
    expect(call2.slice(1)).toContain(50);
    expect(call2.slice(1)).toContain("debito");
  });

  // ── Datas ausentes viram NULL ───────────────────────────────────────────────

  it("data_inicio/data_fim ausentes viram NULL no INSERT extrato", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        data_inicio: "",
        data_fim: "",
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1] });
    await POST(makeRequest({ file: { content: "ofx" } }));
    const extratoCall = sqlMock.mock.calls[1];
    const values = extratoCall.slice(1);
    // data_inicio e data_fim devem ter virado null (operador `|| null`)
    const nulls = values.filter((v) => v === null);
    expect(nulls.length).toBeGreaterThanOrEqual(2);
  });

  it("data_transacao ausente vira NULL no INSERT lançamento", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1] });
    await POST(makeRequest({ file: { content: "ofx" } }));
    const lancCall = sqlMock.mock.calls[2];
    const values = lancCall.slice(1);
    expect(values).toContain(null);
  });

  // ── Resposta ────────────────────────────────────────────────────────────────

  it("resposta inclui banco, conta e periodo formatado", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        banco: "237",
        conta: "98765-4",
        data_inicio: "2026-03-01",
        data_fim: "2026-03-31",
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-03-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ extratoId: 7, insertedIds: [1] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    const data = await res.json();
    expect(data.banco).toBe("237");
    expect(data.conta).toBe("98765-4");
    expect(data.periodo).toBe("2026-03-01 a 2026-03-31");
  });

  it("resposta tem status 201 (Created) — não 200", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1] });
    const res = await POST(makeRequest({ file: { content: "ofx" } }));
    expect(res.status).toBe(201);
  });

  // ── Falha no meio: não há transação, mas comportamento documentado ─────────

  it("falha no INSERT do extrato propaga erro (rota não tem try/catch)", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }]) // SELECT role
      .mockRejectedValueOnce(new Error("DB connection lost")); // INSERT extrato falha
    await expect(
      POST(makeRequest({ file: { content: "ofx" } })),
    ).rejects.toThrow(/DB connection lost/);
  });

  it("falha no INSERT de um lançamento propaga e aborta o restante (sem rollback do extrato)", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "a" },
          { fitid: "F2", tipo: "D", valor: 20, data_transacao: "2026-04-11", descricao: "b" },
        ],
      }),
    );
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }]) // SELECT role
      .mockResolvedValueOnce([{ id: 42 }]) // INSERT extrato OK
      .mockResolvedValueOnce([{ id: 101 }]) // INSERT F1 OK
      .mockRejectedValueOnce(new Error("constraint violation")); // INSERT F2 falha
    await expect(
      POST(makeRequest({ file: { content: "ofx" } })),
    ).rejects.toThrow(/constraint/);
    // Nota: rota NÃO usa sql.begin() → extrato e F1 PERMANECEM no banco.
    // Comportamento intencional? Documentado como suspeito.
  });

  // ── Integração com parseOFX ─────────────────────────────────────────────────

  it("passa o conteúdo do arquivo (text) para parseOFX", async () => {
    parseOFXMock.mockReturnValueOnce(
      makeOFXResult({
        transacoes: [
          { fitid: "F1", tipo: "C", valor: 10, data_transacao: "2026-04-10", descricao: "x" },
        ],
      }),
    );
    mockSqlHappyPath({ insertedIds: [1] });
    await POST(makeRequest({ file: { content: "<OFX>conteudo-aqui</OFX>" } }));
    expect(parseOFXMock).toHaveBeenCalledTimes(1);
    expect(parseOFXMock).toHaveBeenCalledWith("<OFX>conteudo-aqui</OFX>");
  });
});
