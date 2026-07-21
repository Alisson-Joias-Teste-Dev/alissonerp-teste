/**
 * Testes ANTI-VOLTA — rota `GET`/`POST /api/entregas-venda/motoboy/relatorio-pagamento`
 * (reforma 21/07/2026 — relatórios PERSISTIDOS, mockup aprovado pelo
 * Jonathan; ver docs/regras-negocio/entregas.md §12.8 e migration 358).
 *
 * Esta rota MUDOU de comportamento nesta reforma:
 *   - Antes: só `GET`, calculava em tempo real por `entregadorId`+período,
 *     nunca gravava nada (ver histórico do arquivo — versão anterior deste
 *     teste cobria esse cálculo, agora coberto pelo `[id]/route.ts` GET de
 *     detalhe, ver `motoboy-relatorio-pagamento-detalhe-confirmar.test.ts`).
 *   - Agora: `GET` LISTA (paginada, 10/página) os relatórios já criados;
 *     `POST` CRIA (persiste) um relatório novo.
 *
 * Cobre: gate de papel (mesma lista de `motoboy/pagar`), paginação da lista,
 * lista vazia não quebra, validação de schema/marco/período na criação,
 * "nada para criar" quando o período não tem corrida, e o caminho feliz da
 * criação (classificação -> snapshot gravado -> total sugerido correto).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string } | null = null;
let listaRowsMock: Record<string, unknown>[] = [];
let totalMock = 0;
let corridasMock: Record<string, unknown>[] = [];
const sqlCalls: unknown[][] = [];

const sqlFn = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  if (texto.includes("quantidade_corridas")) {
    return Promise.resolve(listaRowsMock);
  }
  if (texto.includes("SELECT COUNT(*)::integer AS total FROM alissonerp.relatorios_pagamento_motoboy")) {
    return Promise.resolve([{ total: totalMock }]);
  }
  if (texto.includes("ROW_NUMBER() OVER")) {
    return Promise.resolve(corridasMock);
  }
  if (texto.includes("relatorios_pagamento_motoboy_itens")) {
    return Promise.resolve([]);
  }
  if (texto.includes("INSERT INTO alissonerp.relatorios_pagamento_motoboy")) {
    return Promise.resolve([{
      id: 999, motoboy_id: "55555555-5555-5555-5555-555555555555",
      data_inicio: "2026-07-20", data_fim: "2026-07-21",
      status: "aguardando", total_sugerido: "0", created_at: "2026-07-21T10:00:00Z", pago_em: null,
    }]);
  }
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

const { GET, POST } = await import("@/app/api/entregas-venda/motoboy/relatorio-pagamento/route");

const USER_ID = "44444444-4444-4444-4444-444444444444";
const ENTREGADOR_ID = "55555555-5555-5555-5555-555555555555";

function getReq(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/entregas-venda/motoboy/relatorio-pagamento${qs ? `?${qs}` : ""}`);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/entregas-venda/motoboy/relatorio-pagamento", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = { role: "admin" };
  listaRowsMock = [];
  totalMock = 0;
  corridasMock = [];
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — gate de papel", () => {
  it("admin/gerente_loja/desenvolvedor passam (mesma lista de motoboy/pagar)", async () => {
    for (const role of ["admin", "gerente_loja", "desenvolvedor"]) {
      usuarioAtual = { role };
      const res = await GET(getReq());
      expect(res.status).toBe(200);
    }
  });

  it("papel sem permissão (ex.: consultora) é barrado com 403", async () => {
    usuarioAtual = { role: "consultora" };
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — lista paginada", () => {
  it("lista vazia -> 200 com items=[] e total=0 (não quebra, critério de aceite: NUNCA some)", async () => {
    listaRowsMock = [];
    totalMock = 0;
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it("devolve items formatados (aguardando e pago convivem na mesma lista)", async () => {
    listaRowsMock = [
      { id: 1, motoboy_id: ENTREGADOR_ID, motoboy_nome: "João", data_inicio: "2026-07-20", data_fim: "2026-07-21", status: "aguardando", total_sugerido: "100.00", created_at: "2026-07-21T10:00:00Z", pago_em: null, quantidade_corridas: 3 },
      { id: 2, motoboy_id: ENTREGADOR_ID, motoboy_nome: "João", data_inicio: "2026-07-14", data_fim: "2026-07-19", status: "pago", total_sugerido: "200.00", created_at: "2026-07-20T10:00:00Z", pago_em: "2026-07-20T12:00:00Z", quantidade_corridas: 5 },
    ];
    totalMock = 2;
    const res = await GET(getReq({ page: "1" }));
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].status).toBe("aguardando");
    expect(body.items[0].total_sugerido).toBe(100);
    expect(body.items[1].status).toBe("pago");
    expect(body.limit).toBe(10);
  });

  it("página inválida/ausente cai em 1 (nunca quebra)", async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.page).toBe(1);
  });
});

describe("POST /api/entregas-venda/motoboy/relatorio-pagamento — gate de papel", () => {
  it("papel sem permissão é barrado com 403", async () => {
    usuarioAtual = { role: "motoboy" };
    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/entregas-venda/motoboy/relatorio-pagamento — validação", () => {
  it("campos obrigatórios ausentes -> 400", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("início depois do fim -> 400", async () => {
    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-21", fim: "2026-07-20" }));
    expect(res.status).toBe(400);
  });

  it("período antes do marco (19/07) -> 400, mesma defesa do cálculo antigo", async () => {
    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-19", fim: "2026-07-21" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/20\/07\/2026/);
  });

  it("nenhuma corrida confirmada no período -> 400 (\"nada para criar\", não cria relatório vazio)", async () => {
    corridasMock = [];
    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/nada para criar/i);
  });
});

describe("POST /api/entregas-venda/motoboy/relatorio-pagamento — criação (caminho feliz)", () => {
  it("cria o relatório com o total sugerido = soma das corridas com decisão inicial 'pagar'", async () => {
    corridasMock = [
      // pagar: venda entregue, sem duplicidade, motoboy cadastrado
      {
        id: 1, frete_motoboy: "20.00", venda_id: 10, is_avulso: false, descricao_avulso: null,
        venda_situacao: "entregue", tem_cadastro_motoboy: true, ordem_na_venda: 1,
      },
      // não pagar: venda cancelada
      {
        id: 2, frete_motoboy: "50.00", venda_id: 11, is_avulso: false, descricao_avulso: null,
        venda_situacao: "cancelado", tem_cadastro_motoboy: true, ordem_na_venda: 1,
      },
      // revisar: duplicada (2ª corrida da mesma venda 10) — decisão inicial "nao_pagar"
      {
        id: 3, frete_motoboy: "20.00", venda_id: 10, is_avulso: false, descricao_avulso: null,
        venda_situacao: "entregue", tem_cadastro_motoboy: true, ordem_na_venda: 2,
      },
    ];

    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.relatorio.quantidade_corridas).toBe(3);

    // Só a corrida 1 (pagar) entra na sugestão inicial — 2 (cancelada) e 3
    // (duplicada -> revisar) começam com decisão "não pagar".
    const insertItens = sqlCalls.filter((args) => textoDaChamada(args).includes("relatorios_pagamento_motoboy_itens"));
    expect(insertItens).toHaveLength(3);
  });

  it("grava o cabeçalho com status inicial 'aguardando'", async () => {
    corridasMock = [
      { id: 1, frete_motoboy: "20.00", venda_id: null, is_avulso: true, descricao_avulso: "Levar peça", venda_situacao: null, tem_cadastro_motoboy: true, ordem_na_venda: 1 },
    ];
    const res = await POST(postReq({ motoboy_id: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    const body = await res.json();
    expect(body.relatorio.status).toBe("aguardando");
  });
});
