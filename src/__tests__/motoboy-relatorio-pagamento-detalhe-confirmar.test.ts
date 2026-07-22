/**
 * Testes ANTI-VOLTA — `GET /api/entregas-venda/motoboy/relatorio-pagamento/[id]`
 * (detalhe do relatório salvo — "Abrir") e
 * `POST .../[id]/confirmar` (confirmar pagamento a partir de um relatório
 * salvo — direto da lista OU depois de abrir/ajustar).
 *
 * Reforma 21/07/2026 — relatórios PERSISTIDOS, mockup aprovado pelo
 * Jonathan (ver docs/regras-negocio/entregas.md §12.8, migration 358).
 *
 * Cobre os 3 testes anti-volta pedidos na task:
 *   1. Confirmar da lista (sem override) usa a decisão persistida na
 *      criação — só as marcadas "pagar" entram no pagamento.
 *   2. Confirmar muda status para 'pago', chama a MESMA lógica de
 *      `motoboy/pagar` (via `criarPagamentoMotoboyTx`) — a MESMA corrida não
 *      pode ser paga de novo (trava existente, `buscarEntregasValidasParaPagar`
 *      filtra por NOT EXISTS em pagamentos_motoboy_itens).
 *   3. Relatório pago não reabre pra pagar — nova tentativa de confirmar
 *      devolve 409 (histórico travado).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string } | null = null;
let relatorioMock: Record<string, unknown> | null = null;
let itensDetalheMock: Record<string, unknown>[] = [];
let itensConfirmarMock: Record<string, unknown>[] = [];
let entregasValidasMock: Record<string, unknown>[] = [];
const sqlCalls: unknown[][] = [];

const sqlFn = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  // Detalhe: cabeçalho
  if (texto.includes("r.total_sugerido, r.created_at, r.pago_em")) {
    return Promise.resolve(relatorioMock ? [relatorioMock] : []);
  }
  // Detalhe: itens + JOIN de exibição
  if (texto.includes("FROM alissonerp.relatorios_pagamento_motoboy_itens i\n    JOIN alissonerp.entregas_venda")) {
    return Promise.resolve(itensDetalheMock);
  }
  // Confirmar: cabeçalho (motoboy_id/status)
  if (texto.includes("r.status, mb.nome AS motoboy_nome")) {
    return Promise.resolve(relatorioMock ? [relatorioMock] : []);
  }
  // Confirmar: itens (entrega_id, decisao) persistidos
  if (texto.includes("SELECT entrega_id, decisao")) {
    return Promise.resolve(itensConfirmarMock);
  }
  // Confirmar (dentro da tx): validação final de entregas (buscarEntregasValidasParaPagar)
  if (texto.includes("NOT EXISTS")) {
    return Promise.resolve(entregasValidasMock);
  }
  // Confirmar (dentro da tx): criarPagamentoMotoboyTx — INSERT pagamentos_motoboy
  if (texto.includes("INSERT INTO alissonerp.pagamentos_motoboy\n")) {
    return Promise.resolve([{ id: 777 }]);
  }
  // Demais INSERT/UPDATE dentro da tx (itens do pagamento, contas_pagar, UPDATE do relatório)
  return Promise.resolve([]);
});
const sqlMock = Object.assign(sqlFn, {
  begin: (fn: (tx: unknown) => unknown) => fn(sqlFn),
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/entrega-venda", () => ({
  buscarFotosEntregaEmLote: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/storage-url", () => ({
  getPublicUrl: (bucket: string, path: string) => `/api/storage/${bucket}/${path}`,
}));

const { GET: GET_DETALHE } = await import("@/app/api/entregas-venda/motoboy/relatorio-pagamento/[id]/route");
const { POST: POST_CONFIRMAR } = await import("@/app/api/entregas-venda/motoboy/relatorio-pagamento/[id]/confirmar/route");

const USER_ID = "44444444-4444-4444-4444-444444444444";
const ENTREGADOR_ID = "55555555-5555-5555-5555-555555555555";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function confirmarReq(body: unknown = {}): NextRequest {
  return new NextRequest("http://localhost/api/entregas-venda/motoboy/relatorio-pagamento/1/confirmar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = { role: "admin" };
  relatorioMock = {
    id: 1, motoboy_id: ENTREGADOR_ID, status: "aguardando",
    total_sugerido: "20.00", created_at: "2026-07-21T10:00:00Z", pago_em: null,
    motoboy_nome: "João",
  };
  itensDetalheMock = [];
  itensConfirmarMock = [];
  entregasValidasMock = [];
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

describe("GET /motoboy/relatorio-pagamento/[id] — detalhe", () => {
  it("papel sem permissão -> 403", async () => {
    usuarioAtual = { role: "consultora" };
    const res = await GET_DETALHE(new NextRequest("http://localhost/x"), paramsFor("1"));
    expect(res.status).toBe(403);
  });

  it("id inválido -> 400", async () => {
    const res = await GET_DETALHE(new NextRequest("http://localhost/x"), paramsFor("abc"));
    expect(res.status).toBe(400);
  });

  it("relatório inexistente -> 404", async () => {
    relatorioMock = null;
    const res = await GET_DETALHE(new NextRequest("http://localhost/x"), paramsFor("999"));
    expect(res.status).toBe(404);
  });

  it("devolve corridas com classificacao/decisao persistidas e foi_pago ao vivo", async () => {
    itensDetalheMock = [
      {
        entrega_id: 10, classificacao: "pagar", decisao: "pagar", frete_motoboy: "20.00",
        codigo_entrega: "ENT-1", venda_id: 5, is_avulso: false, descricao_avulso: null,
        regiao: "fortaleza", data_entrega_realizada: "2026-07-20T10:00:00Z",
        numero_venda: "V-5", cliente_nome: "Cliente A", foi_pago: false,
      },
    ];
    const res = await GET_DETALHE(new NextRequest("http://localhost/x"), paramsFor("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("aguardando");
    expect(body.corridas).toHaveLength(1);
    expect(body.corridas[0].decisao).toBe("pagar");
    expect(body.corridas[0].foi_pago).toBe(false);
  });
});

describe("POST /motoboy/relatorio-pagamento/[id]/confirmar — pago = histórico travado", () => {
  it("relatório já pago -> 409, nunca reconfirma", async () => {
    relatorioMock = { id: 1, motoboy_id: ENTREGADOR_ID, status: "pago", motoboy_nome: "João" };
    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(res.status).toBe(409);
  });

  it("relatório inexistente -> 404", async () => {
    relatorioMock = null;
    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("999"));
    expect(res.status).toBe(404);
  });
});

describe("POST /motoboy/relatorio-pagamento/[id]/confirmar — teste 1: confirma da lista sem ajuste", () => {
  it("usa a decisão PERSISTIDA (sem body.decisoes) — só as 'pagar' entram no pagamento", async () => {
    itensConfirmarMock = [
      { entrega_id: 10, decisao: "pagar" },
      { entrega_id: 11, decisao: "nao_pagar" },
    ];
    entregasValidasMock = [
      { id: 10, frete_motoboy: "20.00", codigo_entrega: "ENT-1", situacao: "confirmada" },
    ];

    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entregas_pagas).toBe(1);
    expect(body.valor_total).toBe(20);

    // A validação final (buscarEntregasValidasParaPagar) só deve ter sido
    // chamada com a entrega 10 (decisão "pagar") — a 11 nunca vira candidata.
    const chamadaValidacao = sqlCalls.find((args) => textoDaChamada(args).includes("NOT EXISTS"));
    expect(chamadaValidacao?.[1]).toContain(10);
    expect(chamadaValidacao?.[1]).not.toContain(11);
  });

  it("nenhuma corrida com decisão 'pagar' -> 400 (nada a confirmar)", async () => {
    itensConfirmarMock = [{ entrega_id: 10, decisao: "nao_pagar" }];
    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(res.status).toBe(400);
  });
});

describe("POST /motoboy/relatorio-pagamento/[id]/confirmar — teste 2: trava (grava pago + itera pagamentos_motoboy_itens)", () => {
  it("confirma com sucesso: cria pagamentos_motoboy, marca relatório 'pago' e devolve o total", async () => {
    itensConfirmarMock = [{ entrega_id: 10, decisao: "pagar" }];
    entregasValidasMock = [{ id: 10, frete_motoboy: "30.00", codigo_entrega: "ENT-1", situacao: "confirmada" }];

    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pagamento_id).toBe(777);

    const updateRelatorio = sqlCalls.find((args) => textoDaChamada(args).includes("SET status = 'pago'"));
    expect(updateRelatorio).toBeTruthy();
  });

  it("aceita override via body.decisoes (marca 'pagar' uma corrida que tinha decisão persistida 'nao_pagar')", async () => {
    itensConfirmarMock = [{ entrega_id: 10, decisao: "nao_pagar" }];
    entregasValidasMock = [{ id: 10, frete_motoboy: "15.00", codigo_entrega: "ENT-1", situacao: "confirmada" }];

    const res = await POST_CONFIRMAR(confirmarReq({ decisoes: { "10": "pagar" } }), paramsFor("1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entregas_pagas).toBe(1);
    expect(body.valor_total).toBe(15);
  });

  it("trava anti-duplo-pagamento: se a validação final não encontra entregas válidas (já pagas em outro lote) -> 400", async () => {
    itensConfirmarMock = [{ entrega_id: 10, decisao: "pagar" }];
    entregasValidasMock = []; // já paga em outro lote — NOT EXISTS falha

    const res = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/já foi paga|não está mais confirmada/i);

    // Nenhum UPDATE de status='pago' deve ter rodado — a trava barrou antes.
    const updateRelatorio = sqlCalls.find((args) => textoDaChamada(args).includes("SET status = 'pago'"));
    expect(updateRelatorio).toBeFalsy();
  });
});

describe("POST /motoboy/relatorio-pagamento/[id]/confirmar — teste 3: relatório pago não reabre pra pagar", () => {
  it("uma 2ª tentativa de confirmar o MESMO relatório (agora 'pago') é rejeitada com 409", async () => {
    // 1ª confirmação: sucesso.
    itensConfirmarMock = [{ entrega_id: 10, decisao: "pagar" }];
    entregasValidasMock = [{ id: 10, frete_motoboy: "10.00", codigo_entrega: "ENT-1", situacao: "confirmada" }];
    const primeira = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(primeira.status).toBe(200);

    // 2ª tentativa: simula o relatório já 'pago' no banco (fonte da verdade).
    relatorioMock = { id: 1, motoboy_id: ENTREGADOR_ID, status: "pago", motoboy_nome: "João" };
    const segunda = await POST_CONFIRMAR(confirmarReq(), paramsFor("1"));
    expect(segunda.status).toBe(409);
  });
});
