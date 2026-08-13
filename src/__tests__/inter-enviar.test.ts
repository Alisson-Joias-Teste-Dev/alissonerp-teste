/**
 * Testes da rota POST /api/financeiro/inter/enviar/[id]
 *
 * A rota:
 *   - Exige autenticação (401)
 *   - Exige role financeiro: desenvolvedor, admin, diretor, gerente_loja, gerente_fabrica
 *     (admin/desenvolvedor/diretor também passam via isFullAccess)
 *   - Valida ID numérico (400)
 *   - Valida body: tipo (pix|boleto|ted) e dados (400)
 *   - Conta deve existir (404), estar 'pendente' (400), e não ter inter_pagamento_id (409)
 *   - Pix: dados.qrcode → criarPixCopiaCola; dados.chave → criarPix; senão 400
 *   - Boleto: dados.codigoBarras obrigatório
 *   - TED: banco, agencia, conta, digito, tipoConta, cpfCnpj, nomeFavorecido obrigatórios
 *   - Salva inter_pagamento_id, inter_status, inter_tipo, inter_dados, inter_enviado_em
 *   - Em erro do Inter: salva inter_erro e retorna 500
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const sqlMock = Object.assign(vi.fn(), {
  array: (arr: unknown[]) => arr,
  begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock)),
  json: vi.fn((v: unknown) => ({ __json: v })),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockCriarPix = vi.fn();
const mockCriarPixCopiaCola = vi.fn();
const mockCriarBoleto = vi.fn();
const mockCriarTed = vi.fn();
const mockMapearStatusInter = vi.fn((s: string) => s ?? "desconhecido");

vi.mock("@/lib/inter", () => ({
  criarPix: mockCriarPix,
  criarPixCopiaCola: mockCriarPixCopiaCola,
  criarBoleto: mockCriarBoleto,
  criarTed: mockCriarTed,
  mapearStatusInter: mockMapearStatusInter,
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const routeModule = await import(
  "@/app/api/financeiro/inter/enviar/[id]/route"
);
const POST = routeModule.POST;
const GET = (routeModule as Record<string, unknown>).GET;
const PATCH = (routeModule as Record<string, unknown>).PATCH;
const PUT = (routeModule as Record<string, unknown>).PUT;
const DELETE = (routeModule as Record<string, unknown>).DELETE;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = "user-uuid-1234";

function makePostRequest(body?: Record<string, unknown> | string) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/financeiro/inter/enviar/123", init);
}

const makeParams = (id: string | number) =>
  ({ params: Promise.resolve({ id: String(id) }) });

/**
 * Helper: pipeline padrão para POST bem-sucedido:
 *   1. SELECT role from usuarios → role autorizada
 *   2. SELECT conta from contas_pagar → conta existe e ok
 *   3. UPDATE de sucesso (com result já injetado pelo helper específico)
 */
function mockHappyPathPrefix(opts?: {
  role?: string;
  conta?: {
    id?: number;
    descricao?: string;
    valor?: number;
    situacao?: string;
    data_vencimento?: string | null;
    inter_pagamento_id?: string | null;
  };
}) {
  sqlMock
    .mockResolvedValueOnce([{ role: opts?.role ?? "admin" }])
    .mockResolvedValueOnce([{
      id: opts?.conta?.id ?? 123,
      descricao: opts?.conta?.descricao ?? "Conta teste",
      valor: opts?.conta?.valor ?? 100.5,
      situacao: opts?.conta?.situacao ?? "pendente",
      data_vencimento:
        opts?.conta && "data_vencimento" in opts.conta
          ? opts.conta.data_vencimento
          : "2026-05-01",
      inter_pagamento_id: opts?.conta?.inter_pagamento_id ?? null,
    }]);
}

// ── Sanidade de exports ───────────────────────────────────────────────────────

describe("Exports do módulo /api/financeiro/inter/enviar/[id]", () => {
  it("exporta POST", () => {
    expect(typeof POST).toBe("function");
  });
  it("não exporta GET", () => expect(GET).toBeUndefined());
  it("não exporta PATCH", () => expect(PATCH).toBeUndefined());
  it("não exporta PUT", () => expect(PUT).toBeUndefined());
  it("não exporta DELETE", () => expect(DELETE).toBeUndefined());
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/financeiro/inter/enviar/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sqlMock.begin = vi.fn(async (cb: (tx: unknown) => unknown) => cb(sqlMock));
    sqlMock.json = vi.fn((v: unknown) => ({ __json: v }));
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockMapearStatusInter.mockImplementation((s: string) => s ?? "desconhecido");
  });

  // ── 1. Auth ────────────────────────────────────────────────────────────────

  it("retorna 401 quando não autenticado", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(1),
    );
    expect(res.status).toBe(401);
  });

  it("não chama sql nem inter quando 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(1),
    );
    expect(sqlMock).not.toHaveBeenCalled();
    expect(mockCriarPix).not.toHaveBeenCalled();
  });

  // ── 2. Permissão ───────────────────────────────────────────────────────────

  it.each([
    "consultora",
    "motoboy",
    "ourives",
    "pcp",
    "estoquista_loja",
  ])("retorna 403 quando role é %s", async (role) => {
    sqlMock.mockResolvedValueOnce([{ role }]);
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(1),
    );
    expect(res.status).toBe(403);
  });

  it("retorna 403 quando usuário não está cadastrado em alissonerp.usuarios", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(1),
    );
    expect(res.status).toBe(403);
  });

  it.each([
    "desenvolvedor",
    "admin",
    "diretor",
    "gerente_loja",
    "gerente_fabrica",
  ])("aceita role %s", async (role) => {
    mockHappyPathPrefix({ role });
    sqlMock.mockResolvedValueOnce([]); // UPDATE
    mockCriarPix.mockResolvedValueOnce({ id: "pag-1", status: "AGENDADO" });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "user@example.com" } }),
      makeParams(123),
    );
    expect(res.status).toBe(200);
  });

  // ── 3. ID inválido ─────────────────────────────────────────────────────────

  it("retorna 400 quando id não é numérico (NaN)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams("abc"),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/id/i);
  });

  // ── 4. Conta não encontrada ────────────────────────────────────────────────

  it("retorna 404 quando conta não existe", async () => {
    sqlMock
      .mockResolvedValueOnce([{ role: "admin" }])
      .mockResolvedValueOnce([]); // SELECT contas_pagar vazio
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(999),
    );
    expect(res.status).toBe(404);
  });

  // ── 5. Situação ≠ 'pendente' ───────────────────────────────────────────────

  it.each([
    "pago",
    "cancelado",
    "atrasado",
    "estornado",
  ])("retorna 400 quando situacao='%s'", async (situacao) => {
    mockHappyPathPrefix({ conta: { situacao } });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/situação/i);
  });

  // ── 6. Conta já enviada antes ──────────────────────────────────────────────

  it("retorna 409 quando inter_pagamento_id já está preenchido", async () => {
    mockHappyPathPrefix({ conta: { inter_pagamento_id: "pag-existente-42" } });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/já enviada/i);
    expect(data.inter_pagamento_id).toBe("pag-existente-42");
  });

  // ── 7. Valor <= 0 ──────────────────────────────────────────────────────────
  // Observação: a rota lê `valor = Number(conta.valor)` mas NÃO valida explicitamente
  // que valor > 0 antes de chamar a API do Inter — repassa o valor adiante.
  // Documentamos esse comportamento aqui (sem assertiva fictícia).

  it("retorna 400 quando conta tem valor 0 (validação local)", async () => {
    mockHappyPathPrefix({ conta: { valor: 0 } });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/valor inválido/i);
    // Não chega a chamar a API Inter
    expect(mockCriarPix).not.toHaveBeenCalled();
  });

  it("retorna 400 quando conta tem valor negativo (validação local)", async () => {
    mockHappyPathPrefix({ conta: { valor: -10 } });
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    expect(mockCriarPix).not.toHaveBeenCalled();
  });

  // ── 8. Body inválido ───────────────────────────────────────────────────────

  it("retorna 400 quando body sem 'tipo'", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(
      makePostRequest({ dados: { chave: "x" } }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/tipo/i);
  });

  it("retorna 400 quando body sem 'dados' (e tipo válido)", async () => {
    sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
    const res = await POST(
      makePostRequest({ tipo: "pix" }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/dados/i);
  });

  // ── 9. Tipo inválido ───────────────────────────────────────────────────────

  it.each(["xpto", "transferencia", "doc", "cartao", ""])(
    "retorna 400 quando tipo é '%s'",
    async (tipo) => {
      sqlMock.mockResolvedValueOnce([{ role: "admin" }]);
      const res = await POST(
        makePostRequest({ tipo, dados: { chave: "x" } }),
        makeParams(123),
      );
      expect(res.status).toBe(400);
    },
  );

  // ── 10. Pix com chave ──────────────────────────────────────────────────────

  it("Pix com chave: chama criarPix e salva inter_* no UPDATE", async () => {
    mockHappyPathPrefix({
      conta: { valor: 250.5, descricao: "Fornecedor X", data_vencimento: "2026-06-15" },
    });
    sqlMock.mockResolvedValueOnce([]); // UPDATE
    mockCriarPix.mockResolvedValueOnce({ id: "pix-id-1", status: "AGENDADO" });

    const res = await POST(
      makePostRequest({
        tipo: "pix",
        dados: { chave: "+5511999998888", descricao: "Pago via PIX" },
      }),
      makeParams(123),
    );

    expect(res.status).toBe(200);
    expect(mockCriarPix).toHaveBeenCalledTimes(1);
    expect(mockCriarPixCopiaCola).not.toHaveBeenCalled();

    const [pixArgs, contaIdArg] = mockCriarPix.mock.calls[0];
    expect(pixArgs.chave).toBe("+5511999998888");
    expect(pixArgs.valor).toBe(250.5);
    expect(pixArgs.descricao).toBe("Pago via PIX");
    expect(pixArgs.dataPagamento).toBe("2026-06-15");
    expect(contaIdArg).toBe(123);

    // UPDATE: 3ª chamada do sql
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/UPDATE.*contas_pagar/i);
    expect(sqlText).toMatch(/inter_pagamento_id/i);
    expect(sqlText).toMatch(/inter_status/i);
    expect(sqlText).toMatch(/inter_tipo/i);
    expect(sqlText).toMatch(/inter_dados/i);
    expect(sqlText).toMatch(/inter_enviado_em/i);
    expect(sqlText).toMatch(/inter_erro\s*=\s*NULL/i);

    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("pix-id-1");
    expect(values).toContain("AGENDADO");
    expect(values).toContain("pix");

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.inter_pagamento_id).toBe("pix-id-1");
    expect(data.inter_status).toBe("AGENDADO");
    expect(data.inter_status_interno).toBe("AGENDADO"); // mock identidade
  });

  it("Pix com chave: usa descricao da conta quando body.dados.descricao ausente", async () => {
    mockHappyPathPrefix({ conta: { descricao: "Conta da loja" } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarPix.mockResolvedValueOnce({ id: "p1", status: "OK" });

    await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "abc" } }),
      makeParams(123),
    );

    expect(mockCriarPix.mock.calls[0][0].descricao).toBe("Conta da loja");
  });

  it("Pix sem chave nem qrcode: retorna 400", async () => {
    mockHappyPathPrefix();
    const res = await POST(
      makePostRequest({ tipo: "pix", dados: {} }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/chave.*qrcode/i);
    expect(mockCriarPix).not.toHaveBeenCalled();
    expect(mockCriarPixCopiaCola).not.toHaveBeenCalled();
  });

  // ── 11. Pix com QR code ────────────────────────────────────────────────────

  it("Pix com qrcode: chama criarPixCopiaCola (não criarPix)", async () => {
    mockHappyPathPrefix({ conta: { valor: 99.9, descricao: "Boleto Pix" } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarPixCopiaCola.mockResolvedValueOnce({ id: "qr-1", status: "AGENDADO" });

    const res = await POST(
      makePostRequest({
        tipo: "pix",
        dados: { qrcode: "00020126...COPIACOLA" },
      }),
      makeParams(123),
    );

    expect(res.status).toBe(200);
    expect(mockCriarPixCopiaCola).toHaveBeenCalledTimes(1);
    expect(mockCriarPix).not.toHaveBeenCalled();

    const [args, contaIdArg] = mockCriarPixCopiaCola.mock.calls[0];
    expect(args.qrcode).toBe("00020126...COPIACOLA");
    expect(args.valor).toBe(99.9);
    expect(args.descricao).toBe("Boleto Pix");
    expect(contaIdArg).toBe(123);

    const values = sqlMock.mock.calls[2].slice(1) as unknown[];
    expect(values).toContain("pix");
    expect(values).toContain("qr-1");
  });

  it("Pix com qrcode: descricao customizada do body sobrepõe descricao da conta", async () => {
    mockHappyPathPrefix({ conta: { descricao: "default" } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarPixCopiaCola.mockResolvedValueOnce({ id: "qr-x", status: "OK" });

    await POST(
      makePostRequest({
        tipo: "pix",
        dados: { qrcode: "Q", descricao: "custom" },
      }),
      makeParams(123),
    );

    expect(mockCriarPixCopiaCola.mock.calls[0][0].descricao).toBe("custom");
  });

  // ── 12. Boleto ─────────────────────────────────────────────────────────────

  it("Boleto: chama criarBoleto e salva inter_tipo='boleto'", async () => {
    mockHappyPathPrefix({ conta: { valor: 1500, data_vencimento: "2026-07-01" } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarBoleto.mockResolvedValueOnce({ id: "bol-1", status: "AGENDADO" });

    const res = await POST(
      makePostRequest({
        tipo: "boleto",
        dados: { codigoBarras: "00190500954014481606906809350314337370000000100" },
      }),
      makeParams(123),
    );

    expect(res.status).toBe(200);
    expect(mockCriarBoleto).toHaveBeenCalledTimes(1);
    const [args, contaIdArg] = mockCriarBoleto.mock.calls[0];
    expect(args.codigoBarras).toBe("00190500954014481606906809350314337370000000100");
    expect(args.valor).toBe(1500);
    expect(args.dataPagamento).toBe("2026-07-01");
    expect(contaIdArg).toBe(123);

    const values = sqlMock.mock.calls[2].slice(1) as unknown[];
    expect(values).toContain("boleto");
    expect(values).toContain("bol-1");
  });

  it("Boleto sem codigoBarras: retorna 400", async () => {
    mockHappyPathPrefix();
    const res = await POST(
      makePostRequest({ tipo: "boleto", dados: {} }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/codigoBarras/i);
    expect(mockCriarBoleto).not.toHaveBeenCalled();
  });

  // ── 13. TED ────────────────────────────────────────────────────────────────

  const tedFull = {
    banco: "001",
    agencia: "1234",
    conta: "56789",
    digito: "0",
    tipoConta: "CC" as const,
    cpfCnpj: "12345678900",
    nomeFavorecido: "João da Silva",
  };

  it("TED com todos os campos: chama criarTed e salva inter_tipo='ted'", async () => {
    mockHappyPathPrefix({ conta: { valor: 2000, data_vencimento: "2026-08-10" } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarTed.mockResolvedValueOnce({ id: "ted-1", status: "AGENDADO" });

    const res = await POST(
      makePostRequest({ tipo: "ted", dados: tedFull }),
      makeParams(123),
    );

    expect(res.status).toBe(200);
    expect(mockCriarTed).toHaveBeenCalledTimes(1);
    const [args, contaIdArg] = mockCriarTed.mock.calls[0];
    expect(args).toMatchObject(tedFull);
    expect(args.valor).toBe(2000);
    expect(args.dataPagamento).toBe("2026-08-10");
    expect(contaIdArg).toBe(123);

    const values = sqlMock.mock.calls[2].slice(1) as unknown[];
    expect(values).toContain("ted");
    expect(values).toContain("ted-1");
  });

  it.each([
    "banco",
    "agencia",
    "conta",
    "digito",
    "tipoConta",
    "cpfCnpj",
    "nomeFavorecido",
  ])("TED sem '%s' obrigatório: retorna 400", async (campo) => {
    const dados = { ...tedFull } as Record<string, unknown>;
    delete dados[campo];
    mockHappyPathPrefix();
    const res = await POST(
      makePostRequest({ tipo: "ted", dados }),
      makeParams(123),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(new RegExp(campo, "i"));
    expect(mockCriarTed).not.toHaveBeenCalled();
  });

  // ── 14. Erro do Inter API ──────────────────────────────────────────────────

  it("Pix: erro do Inter → retorna 500 e salva inter_erro", async () => {
    mockHappyPathPrefix();
    mockCriarPix.mockRejectedValueOnce(new Error("Inter API: chave inválida"));
    sqlMock.mockResolvedValueOnce([]); // UPDATE de erro

    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/chave inválida/i);

    // 3ª chamada do sql é o UPDATE de erro
    const updateCall = sqlMock.mock.calls[2];
    const sqlText = (updateCall[0] as string[]).join(" ");
    expect(sqlText).toMatch(/UPDATE.*contas_pagar/i);
    expect(sqlText).toMatch(/inter_erro/i);
    const values = updateCall.slice(1) as unknown[];
    expect(values).toContain("Inter API: chave inválida");
  });

  it("Boleto: erro do Inter (string thrown) → retorna 500 com mensagem stringificada", async () => {
    mockHappyPathPrefix();
    mockCriarBoleto.mockRejectedValueOnce("falha-bruta");
    sqlMock.mockResolvedValueOnce([]);

    const res = await POST(
      makePostRequest({ tipo: "boleto", dados: { codigoBarras: "123" } }),
      makeParams(123),
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("falha-bruta");

    const values = sqlMock.mock.calls[2].slice(1) as unknown[];
    expect(values).toContain("falha-bruta");
  });

  it("TED: erro do Inter → retorna 500 e salva inter_erro", async () => {
    mockHappyPathPrefix();
    mockCriarTed.mockRejectedValueOnce(new Error("conta inexistente"));
    sqlMock.mockResolvedValueOnce([]);

    const res = await POST(
      makePostRequest({ tipo: "ted", dados: tedFull }),
      makeParams(123),
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/conta inexistente/i);
  });

  // ── 15. Sucesso: payload de retorno ────────────────────────────────────────

  it("sucesso: retorna { ok, inter_pagamento_id, inter_status, inter_status_interno }", async () => {
    mockHappyPathPrefix();
    sqlMock.mockResolvedValueOnce([]);
    mockCriarPix.mockResolvedValueOnce({ id: "ok-1", status: "AGUARDANDO_APROVACAO" });
    mockMapearStatusInter.mockReturnValueOnce("pendente_aprovacao");

    const res = await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "x" } }),
      makeParams(123),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      inter_pagamento_id: "ok-1",
      inter_status: "AGUARDANDO_APROVACAO",
      inter_status_interno: "pendente_aprovacao",
    });
    expect(mockMapearStatusInter).toHaveBeenCalledWith("AGUARDANDO_APROVACAO");
  });

  it("sucesso: data_vencimento null → dataPagamento undefined repassado ao Inter", async () => {
    mockHappyPathPrefix({ conta: { data_vencimento: null } });
    sqlMock.mockResolvedValueOnce([]);
    mockCriarPix.mockResolvedValueOnce({ id: "x", status: "OK" });

    await POST(
      makePostRequest({ tipo: "pix", dados: { chave: "y" } }),
      makeParams(123),
    );

    expect(mockCriarPix.mock.calls[0][0].dataPagamento).toBeUndefined();
  });
});
