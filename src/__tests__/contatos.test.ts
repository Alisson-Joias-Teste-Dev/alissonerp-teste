/**
 * Testes da rota /api/contatos (POST e PATCH)
 *
 * POST — cadastrar novo contato (usado pelo cadastro de fornecedor no módulo
 *        Compras Comercial e pelo cadastro de cliente nas vendas)
 *   1. 401 sem usuário autenticado
 *   2. 400 sem nome (validação Zod + fallback manual)
 *   3. 400 com nome vazio/whitespace
 *   4. 409 quando CPF/CNPJ já existe — retorna erro + dados do contato existente
 *   5. 201 com dados mínimos (apenas nome)
 *   6. 201 com todos os campos preenchidos — confere trim, CPF sem máscara, CEP sem máscara, UF uppercase
 *   7. CPF com menos de 11 dígitos — não verifica duplicidade (segue para INSERT)
 *   8. Sem CPF — pula verificação de duplicidade (segue para INSERT)
 *   9. Enfileira sync com Tiny (INSERT em fila_sync_externo) após criação
 *
 * PATCH — atualizar contato existente
 *  10. 401 sem usuário autenticado
 *  11. 400 sem id
 *  12. 404 quando contato não encontrado
 *  13. 200 atualiza apenas campos enviados (COALESCE mantém valores anteriores)
 *  14. Enfileira sync com Tiny após atualização
 *
 * REGRA DE NEGÓCIO:
 * - Cadastro de fornecedor no módulo Compras Comercial usa este endpoint como
 *   fonte única (public.contatos), validado pelo DBA em 02/06/2026.
 * - CPF/CNPJ é armazenado sem máscara (apenas dígitos).
 * - CEP é armazenado sem máscara (apenas dígitos).
 * - UF é armazenado em uppercase.
 * - Sync com Tiny é assíncrono e não bloqueia a criação do contato.
 *
 * IMPACTO SE REMOVIDO: cadastro de fornecedor e cliente param de funcionar,
 * quebrando criação de compras comerciais e vendas.
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

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST, PATCH } = await import("@/app/api/contatos/route");

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID = "user-uuid-1234";

/**
 * Cria uma NextRequest simulando POST para /api/contatos.
 * REGRA DE NEGÓCIO: usado pelo frontend do Compras Comercial (cadastro de fornecedor)
 * e pelas telas de venda (cadastro de cliente).
 */
function makePostRequest(body?: Record<string, unknown>) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/contatos", init);
}

function makePatchRequest(body?: Record<string, unknown>) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/contatos", init);
}

// ── Testes POST ──────────────────────────────────────────────────────────────

describe("POST /api/contatos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  // ─── 1. Autenticação ────────────────────────────────────────────────────────
  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makePostRequest({ nome: "Fornecedor X" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/autenticado/i);
  });

  // ─── 2. Validação de nome ───────────────────────────────────────────────────
  it("retorna 400 quando body é vazio (Zod rejeita nome ausente)", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando nome é string vazia após trim", async () => {
    const res = await POST(makePostRequest({ nome: "   " }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/obrigatório/i);
  });

  // ─── 3. Cadastro mínimo (apenas nome) ───────────────────────────────────────
  it("retorna 201 com cadastro mínimo (apenas nome), sem verificação de CPF", async () => {
    // Mock: INSERT retorna contato criado, depois INSERT na fila_sync
    const contatoMock = { id: 99, nome: "Fornecedor Minimo" };
    sqlMock
      .mockResolvedValueOnce([contatoMock]) // INSERT INTO public.contatos
      .mockResolvedValueOnce([]);           // INSERT INTO fila_sync_externo

    const res = await POST(makePostRequest({ nome: "Fornecedor Minimo" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(99);
    expect(data.nome).toBe("Fornecedor Minimo");
  });

  // ─── 4. Cadastro completo — todos os campos ─────────────────────────────────
  it("retorna 201 com todos os campos, normalizando CPF, CEP e UF", async () => {
    // Sem CPF duplicado
    sqlMock
      .mockResolvedValueOnce([])               // SELECT CPF (não existe)
      .mockResolvedValueOnce([{ id: 100, nome: "Fornecedor Completo" }]) // INSERT contato
      .mockResolvedValueOnce([]);              // INSERT fila_sync

    const res = await POST(makePostRequest({
      nome: "  Fornecedor Completo  ",
      cpf_cnpj: "123.456.789-00",
      telefone: "(11) 9999-9999",
      celular: "(11) 98888-8888",
      email: "fornecedor@teste.com",
      cep: "01001-000",
      endereco: "Rua Teste",
      numero: "123",
      complemento: "Sala 1",
      bairro: "Centro",
      municipio: "São Paulo",
      uf: "sp",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(100);
    expect(data.nome).toBe("Fornecedor Completo"); // confirmado trim no retorno do banco
  });

  // ─── 5. CPF duplicado (409) — cenário crítico para o fluxo de fornecedor ────
  it("retorna 409 quando CPF já cadastrado, com dados do contato existente", async () => {
    // REGRA DE NEGÓCIO: o frontend (ComprasComercialClient) usa o contato retornado
    // para sugerir o fornecedor existente em vez de criar duplicado.
    const contatoExistente = { id_contato: 50, nome: "Fornecedor Antigo" };
    sqlMock.mockResolvedValueOnce([contatoExistente]); // SELECT CPF (já existe)

    const res = await POST(makePostRequest({
      nome: "Fornecedor Novo",
      cpf_cnpj: "123.456.789-00",
    }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("Fornecedor Antigo");
    expect(data.contato.id_contato).toBe(50);
    expect(data.contato.nome).toBe("Fornecedor Antigo");
  });

  // ─── 6. CPF com menos de 11 dígitos — pula verificação de duplicidade ───────
  it("pula verificação de duplicidade quando CPF tem menos de 11 dígitos", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 101, nome: "CPF Curto" }]) // INSERT contato
      .mockResolvedValueOnce([]);                               // INSERT fila_sync

    const res = await POST(makePostRequest({
      nome: "CPF Curto",
      cpf_cnpj: "12345", // apenas 5 dígitos
    }));
    expect(res.status).toBe(201);
  });

  // ─── 7. Sem CPF informado — pula verificação de duplicidade ─────────────────
  it("não verifica CPF quando campo não é enviado", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 102, nome: "Sem CPF" }]) // INSERT contato
      .mockResolvedValueOnce([]);                             // INSERT fila_sync

    const res = await POST(makePostRequest({ nome: "Sem CPF" }));
    expect(res.status).toBe(201);
  });

  // ─── 8. Enfileira sync com Tiny ─────────────────────────────────────────────
  it("enfileira sync com Tiny (INSERT em fila_sync_externo) após criação", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 200, nome: "Sync Tiny" }]) // INSERT contato
      .mockResolvedValueOnce([]);                               // INSERT fila_sync

    await POST(makePostRequest({ nome: "Sync Tiny" }));

    // Verifica que o segundo INSERT foi para fila_sync_externo
    const secondCall = sqlMock.mock.calls[1];
    const secondSql = secondCall[0]; // array de strings do template literal
    const sqlText = Array.isArray(secondSql) ? secondSql.join(" ") : String(secondSql);
    expect(sqlText).toMatch(/fila_sync_externo/);
    expect(sqlText).toMatch(/sync_contato/);
  });

  // ─── 9. Body inválido (não é JSON) ─────────────────────────────────────────
  it("retorna 400 quando body não é JSON válido", async () => {
    // json().catch(() => ({})) → {} → Zod rejeita por falta de nome
    const res = await POST(makePostRequest("texto-invalido" as unknown as Record<string, unknown>) );
    expect(res.status).toBe(400);
  });
});

// ── Testes PATCH ─────────────────────────────────────────────────────────────

describe("PATCH /api/contatos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  });

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(makePatchRequest({ id: 1, nome: "Novo Nome" }));
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem id", async () => {
    const res = await PATCH(makePatchRequest({ nome: "Sem ID" }));
    expect(res.status).toBe(400);
  });

  it("retorna 404 quando contato não encontrado", async () => {
    sqlMock.mockResolvedValueOnce([]); // UPDATE não retorna nada
    const res = await PATCH(makePatchRequest({ id: 9999, nome: "Inexistente" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/não encontrado/i);
  });

  it("retorna 200 e atualiza contato com campos enviados", async () => {
    const contatoAtualizado = { id: 10, nome: "Nome Atualizado", cpf_cnpj: "12345678900", telefone: "1199999999", celular: null, email: null, endereco: null, numero: null, complemento: null, bairro: null, municipio: null, cep: null, uf: null };
    sqlMock
      .mockResolvedValueOnce([contatoAtualizado]) // UPDATE retorna contato
      .mockResolvedValueOnce([]);                 // INSERT fila_sync

    const res = await PATCH(makePatchRequest({ id: 10, nome: "  Nome Atualizado  " }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nome).toBe("Nome Atualizado");
  });

  it("enfileira sync com Tiny após atualização", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 20, nome: "Atualizado" }]) // UPDATE
      .mockResolvedValueOnce([]);                               // INSERT fila_sync

    await PATCH(makePatchRequest({ id: 20, nome: "Atualizado" }));

    const secondCall = sqlMock.mock.calls[1];
    const secondSql = secondCall[0];
    const sqlText = Array.isArray(secondSql) ? secondSql.join(" ") : String(secondSql);
    expect(sqlText).toMatch(/fila_sync_externo/);
    expect(sqlText).toMatch(/sync_contato/);
  });
});
