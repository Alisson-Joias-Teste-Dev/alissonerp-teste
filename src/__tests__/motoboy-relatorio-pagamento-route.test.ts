/**
 * Teste ANTI-VOLTA — rota GET /api/entregas-venda/motoboy/relatorio-pagamento
 * (relatório de pagamento do motoboy por entregador+período, 21/07/2026).
 *
 * Cobre o que a classificação PURA (relatorio-pagamento-motoboy.test.ts) não
 * cobre: o GATE de papel (mesma lista de `motoboy/pagar`), o bloqueio de
 * período antes do marco 20/07, a rota aguentando lista vazia sem quebrar, e
 * a integração fim-a-fim (SQL mockado -> classificação -> total) usando o
 * MESMO padrão de mock de `entregas-venda-estoquista-acesso.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string } | null = null;
let corridasMock: Record<string, unknown>[] = [];
let fotosMock: Record<string, unknown>[] = [];
const sqlCalls: unknown[][] = [];

const sqlMock = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  if (texto.includes("ROW_NUMBER() OVER")) {
    return Promise.resolve(corridasMock);
  }
  if (texto.includes("WHERE ev.id = ANY")) {
    return Promise.resolve(fotosMock);
  }
  return Promise.resolve([]);
});
vi.mock("@/lib/db", () => ({ default: (...args: unknown[]) => sqlMock(...args) }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const { GET } = await import("@/app/api/entregas-venda/motoboy/relatorio-pagamento/route");

const USER_ID = "44444444-4444-4444-4444-444444444444";
const ENTREGADOR_ID = "55555555-5555-5555-5555-555555555555";

function req(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/entregas-venda/motoboy/relatorio-pagamento?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = { role: "admin" };
  corridasMock = [];
  fotosMock = [];
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — gate de papel", () => {
  it("admin/gerente_loja/desenvolvedor passam (mesma lista de motoboy/pagar)", async () => {
    for (const role of ["admin", "gerente_loja", "desenvolvedor"]) {
      usuarioAtual = { role };
      const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
      expect(res.status).toBe(200);
    }
  });

  it("papel sem permissão (ex.: consultora) é barrado com 403", async () => {
    usuarioAtual = { role: "consultora" };
    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(403);
  });

  it("motoboy/entregador (o próprio entregador) NÃO acessa o relatório de pagamento", async () => {
    usuarioAtual = { role: "entregador" };
    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — marco 20/07", () => {
  it("período começando ANTES do marco (19/07) é bloqueado (400)", async () => {
    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-19", fim: "2026-07-21" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/20\/07\/2026/);
  });

  it("período começando NO marco (20/07) é aceito", async () => {
    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(200);
  });

  it("parâmetros obrigatórios ausentes -> 400, não 500", async () => {
    const semEntregador = await GET(req({ inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(semEntregador.status).toBe(400);

    const semPeriodo = await GET(req({ entregadorId: ENTREGADOR_ID }));
    expect(semPeriodo.status).toBe(400);
  });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — lista vazia", () => {
  it("nenhuma corrida no período -> 200 com lista vazia e total 0 (não quebra)", async () => {
    corridasMock = [];
    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.corridas).toEqual([]);
    expect(body.total_pagar).toBe(0);
  });
});

describe("GET /api/entregas-venda/motoboy/relatorio-pagamento — classificação fim-a-fim (sugestão, 21/07: duplicidade é Revisar)", () => {
  it("classifica e soma corretamente: 1 pagar, 1 venda cancelada (não pagar), 1 duplicada (revisar — suspeita, não certeza)", async () => {
    corridasMock = [
      {
        id: 1, codigo_entrega: "ENT-1", venda_id: 10, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "20.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T10:00:00Z",
        created_at: "2026-07-20T09:00:00Z", numero_venda: "V-10", venda_situacao: "entregue",
        cliente_nome: "Cliente A", tem_cadastro_motoboy: true, foi_pago: false, ordem_na_venda: 1,
      },
      {
        id: 2, codigo_entrega: "ENT-2", venda_id: 11, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "50.00", regiao: "fora_fortaleza", data_entrega_realizada: "2026-07-20T11:00:00Z",
        created_at: "2026-07-20T10:30:00Z", numero_venda: "V-11", venda_situacao: "cancelado",
        cliente_nome: "Cliente B", tem_cadastro_motoboy: true, foi_pago: false, ordem_na_venda: 1,
      },
      {
        id: 3, codigo_entrega: "ENT-3", venda_id: 10, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "20.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T12:00:00Z",
        created_at: "2026-07-20T11:30:00Z", numero_venda: "V-10", venda_situacao: "entregue",
        cliente_nome: "Cliente A", tem_cadastro_motoboy: true, foi_pago: false, ordem_na_venda: 2,
      },
    ];
    fotosMock = [
      { entrega_id: 1, fotos: ["pagamento-fotos/foto1.jpg"] },
      { entrega_id: 2, fotos: [] },
      { entrega_id: 3, fotos: [] },
    ];

    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.corridas).toHaveLength(3);
    interface CorridaBody { id: number; classificacao: string; fotos: string[]; foi_pago: boolean }
    const porId = new Map<number, CorridaBody>(
      body.corridas.map((c: CorridaBody) => [c.id, c]),
    );
    expect(porId.get(1)?.classificacao).toBe("pagar");
    expect(porId.get(2)?.classificacao).toBe("nao_pagar"); // venda cancelada (única certeza automática)
    expect(porId.get(3)?.classificacao).toBe("revisar"); // duplicada — suspeita, o financeiro decide

    // Total (sugestão bruta) bate com SUM(frete_motoboy) só da(s) classificada(s) "pagar" (só a corrida 1: 20).
    // A duplicada (revisar) NÃO entra na sugestão — precisa de ajuste manual do financeiro pra virar "pagar".
    expect(body.total_pagar).toBe(20);

    // Fotos vêm como LINK (proxy autenticado), nunca a imagem embutida.
    expect(porId.get(1)?.fotos[0]).toContain("/api/storage/pagamento-fotos/");

    // Nenhuma das 3 já foi paga em lote anterior.
    expect(porId.get(1)?.foi_pago).toBe(false);
  });

  it("corrida classificada 'pagar' mas JÁ PAGA em lote anterior (foi_pago=true) não entra na sugestão de total", async () => {
    corridasMock = [
      {
        id: 1, codigo_entrega: "ENT-1", venda_id: 10, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "20.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T10:00:00Z",
        created_at: "2026-07-20T09:00:00Z", numero_venda: "V-10", venda_situacao: "entregue",
        cliente_nome: "Cliente A", tem_cadastro_motoboy: true, foi_pago: true, ordem_na_venda: 1,
      },
      {
        id: 2, codigo_entrega: "ENT-2", venda_id: 12, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "40.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T11:00:00Z",
        created_at: "2026-07-20T10:00:00Z", numero_venda: "V-12", venda_situacao: "entregue",
        cliente_nome: "Cliente C", tem_cadastro_motoboy: true, foi_pago: false, ordem_na_venda: 1,
      },
    ];
    fotosMock = [
      { entrega_id: 1, fotos: [] },
      { entrega_id: 2, fotos: [] },
    ];

    const res = await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));
    const body = await res.json();

    interface CorridaBody { id: number; classificacao: string; foi_pago: boolean }
    const porId = new Map<number, CorridaBody>(body.corridas.map((c: CorridaBody) => [c.id, c]));
    expect(porId.get(1)?.classificacao).toBe("pagar");
    expect(porId.get(1)?.foi_pago).toBe(true);

    // Só a corrida 2 (não paga) entra na sugestão de total — a 1 já está liquidada.
    expect(body.total_pagar).toBe(40);
  });

  it("NÃO faz uma query de fotos por corrida — só 1 chamada extra por causa do lote", async () => {
    corridasMock = [
      {
        id: 1, codigo_entrega: "ENT-1", venda_id: 10, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "20.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T10:00:00Z",
        created_at: "2026-07-20T09:00:00Z", numero_venda: "V-10", venda_situacao: "entregue",
        cliente_nome: "Cliente A", tem_cadastro_motoboy: true, ordem_na_venda: 1,
      },
      {
        id: 2, codigo_entrega: "ENT-2", venda_id: 12, is_avulso: false, descricao_avulso: null,
        frete_motoboy: "20.00", regiao: "fortaleza", data_entrega_realizada: "2026-07-20T11:00:00Z",
        created_at: "2026-07-20T10:00:00Z", numero_venda: "V-12", venda_situacao: "entregue",
        cliente_nome: "Cliente C", tem_cadastro_motoboy: true, ordem_na_venda: 1,
      },
    ];
    fotosMock = [
      { entrega_id: 1, fotos: [] },
      { entrega_id: 2, fotos: [] },
    ];

    await GET(req({ entregadorId: ENTREGADOR_ID, inicio: "2026-07-20", fim: "2026-07-21" }));

    const chamadasDeFotos = sqlCalls.filter((args) => textoDaChamada(args).includes("WHERE ev.id = ANY"));
    expect(chamadasDeFotos).toHaveLength(1);
  });
});
