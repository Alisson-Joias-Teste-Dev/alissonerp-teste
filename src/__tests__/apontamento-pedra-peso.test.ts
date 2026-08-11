/**
 * Testes do apontamento de PEDRA por PESO — PCP e Distribuição.
 *
 * O BUG QUE ESTES TESTES TRANCAM:
 * A tela de apontamento de pedra manda o peso em gramas (`peso_g_pedra`) e NÃO
 * manda `qtd` (quantidade de peças). A validação de entrada das duas rotas exigia
 * `qtd`, então TODO apontamento de pedra morria com "Dados invalidos" antes de
 * chegar em qualquer regra — desde 17/05/2026 (v2.58.0), quando o zod entrou.
 *
 * O SEGUNDO BUG, ACHADO EM 11/08/2026 (PCP #1130, PD1019):
 * a trava de saldo comparava GRAMA contra QUILATE. O saldo da vw_saldo_estoque vem
 * em grama para pedra (é assim que a migration 122 e a EstoqueClient.tsx o leem,
 * dividindo por 0,2 para exibir ct), mas a trava comparava esse número cru contra
 * `peso_ct_final`, que está em ct. Resultado: 5x mais restritiva, recusando
 * "Disponível: 0.4140ct, solicitado: 2.0700ct" com o estoque inteiro disponível.
 *
 * ⚠️ ESTES TESTES JÁ TRANCARAM A REGRA ERRADA. Antes de 11/08 eles afirmavam que o
 * saldo vinha em ct ("saldo exatamente igual ao pedido (12,15 ct) → passa") e por
 * isso deram luz verde ao defeito. Ao mexer aqui: `saldoDisponivel` é GRAMA.
 *
 * Cobre, nas duas rotas:
 *  1. Pedra por peso, sem `qtd`        → 201, grava peso em g e o ct convertido
 *  2. Insumo comum sem `qtd`           → 400 (REGRESSÃO: a trava não pode cair junto)
 *  3. Pedra sem peso e sem `qtd`       → 400
 *  4. Pedra sem saldo                  → 422 com a mensagem em ct (não em "UN")
 *  5. Saldo em grama EXATAMENTE igual ao pedido em ct → 201 (armadilha de ponto flutuante)
 *  6. O caso real do PD1019            → 201, e o negativo dele → 422
 *
 * Regra de conversão: 1 ct = 0,2 g. 2,43 g → 12,15 ct. 0,414 g → 2,07 ct.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

type SqlCall = { text: string; values: unknown[] };
const sqlCalls: SqlCall[] = [];

// Saldo devolvido pela vw_saldo_estoque — SEMPRE EM GRAMAS, inclusive para pedra.
// (era comentado como "em ct" e essa suposição errada é o que deixou o bug passar)
let saldoDisponivel = 1000;

/**
 * sql`` é tagged template: recebe (strings, ...values). O mock decide o retorno
 * pelo TEXTO da query (e não pela ordem das chamadas), para o teste não quebrar
 * quando alguém inserir uma query nova no meio da rota.
 */
const sqlMock = Object.assign(
  vi.fn((strings: TemplateStringsArray | string[], ...values: unknown[]): Promise<unknown[]> => {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    sqlCalls.push({ text, values });

    if (text.includes("vw_saldo_estoque")) return Promise.resolve([{ saldo: saldoDisponivel }]);
    if (text.includes("INSERT INTO")) return Promise.resolve([{ id: 999 }]);
    // Guard do tipo 2 (operador já atribuído): sem depósito atribuído → passa.
    if (text.includes("pcp_deposito_id")) return Promise.resolve([{ pcp_deposito_id: null, ordem_deposito_id: null }]);
    if (text.includes("FROM alissonerp.insumos")) return Promise.resolve([{ ppct: 0.5, pp: 0.1 }]);
    return Promise.resolve([]);
  }),
  { array: (arr: unknown[]) => arr },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

// Sem sessão Supabase: a rota do PCP pula o guard de ourives e segue o fluxo.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

// A rota da Distribuição exige sessão — devolvemos um admin.
vi.mock("@/lib/auth-server", () => ({
  requireAuth: vi.fn(async () => ({ id: "user-teste", role: "admin", email: "t@x.com" })),
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/parametros", () => ({
  getParametroNumber: vi.fn(async () => 1), // Almoxarifado Central
  PARAM: { ALMOXARIFADO_DEPOSITO_ID: "almoxarifado_deposito_id" },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/recalcular-totais-pcp", () => ({ recalcularTotaisPCP: vi.fn(async () => {}) }));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST: postPcp } = await import("@/app/api/pcp/apontamentos/route");
const { POST: postDist } = await import("@/app/api/distribuicao/apontamentos/route");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- só precisamos de req.json()
const req = (body: unknown): any => ({ json: async () => body });

function insertDe(tabela: string): SqlCall {
  const call = sqlCalls.find((c) => c.text.includes(`INSERT INTO alissonerp.${tabela}`));
  if (!call) throw new Error(`INSERT em ${tabela} não aconteceu`);
  return call;
}

beforeEach(() => {
  sqlCalls.length = 0;
  saldoDisponivel = 1000;
});

// ══════════════════════════════════════════════════════════════════════════════
// PCP
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/pcp/apontamentos — pedra por peso", () => {
  // Payload idêntico ao que a tela manda: peso em gramas, SEM qtd.
  const pedraPcp = {
    tipo_apontamento_id: 3,           // Entrada de Pedra
    deposito_id: 7,
    setor_id: null,
    insumo_id: 1352,                  // Mossanite 12mm (PD-1352)
    pcp_id: 1136,
    peso_g_pedra: 2.43,
    peso_ct: 12.15,
    foto_balanca: "apontamentos/x.jpg",
  };

  it("tipo 3 com peso e SEM qtd → 201 (era 400 'Dados invalidos')", async () => {
    const res = await postPcp(req(pedraPcp));
    expect(res.status).toBe(201);

    // Ordem das colunas no INSERT: ..., pcp_id, qtd, peso_g_pedra, peso_ct, ...
    const { values } = insertDe("apontamentos_pcp");
    expect(values[5]).toBe(2.43);   // qtd guarda o peso em GRAMAS (coluna NOT NULL)
    expect(values[6]).toBe(2.43);   // peso_g_pedra
    expect(values[7]).toBe(12.15);  // peso_ct = 2,43 / 0,2
  });

  it("tipo 6 (retorno de pedra) com peso e SEM qtd → 201", async () => {
    const res = await postPcp(req({ ...pedraPcp, tipo_apontamento_id: 6 }));
    expect(res.status).toBe(201);
    expect(insertDe("apontamentos_pcp").values[7]).toBe(12.15);
  });

  it("REGRESSÃO: insumo comum (tipo 2) sem qtd → 400, a trava continua de pé", async () => {
    const res = await postPcp(req({
      tipo_apontamento_id: 2, deposito_id: 7, insumo_id: 10, pcp_id: 1136,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("qtd é obrigatório");
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO"))).toBe(false);
  });

  it("pedra sem peso e sem qtd → 400", async () => {
    const res = await postPcp(req({ ...pedraPcp, peso_g_pedra: undefined, peso_ct: undefined }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("peso_g_pedra ou qtd");
  });

  it("pedra sem saldo → 422 com a mensagem em ct", async () => {
    saldoDisponivel = 1; // 1 g = 5 ct, menos que os 12,15 ct pedidos
    const res = await postPcp(req(pedraPcp));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error).toContain("ct");
    expect(error).toContain("5.0000ct");   // o disponível sai convertido para ct
    expect(error).toContain("1.0000g");    // e a grama pesada aparece junto
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO"))).toBe(false);
  });

  it("REGRESSÃO: insumo comum (tipo 2) COM qtd continua entrando → 201", async () => {
    const res = await postPcp(req({
      tipo_apontamento_id: 2, deposito_id: 7, insumo_id: 10, pcp_id: 1136, qtd: 4.5,
    }));
    expect(res.status).toBe(201);
    expect(insertDe("apontamentos_pcp").values[5]).toBe(4.5);
  });

  it("saldo em grama EXATAMENTE igual ao pedido em ct → passa", async () => {
    // 2,43 g de saldo = 12,15 ct, exatamente o que o apontamento pede.
    // ARMADILHA que este teste tranca: sem arredondar em 4 casas, 2.43 / 0.2 dá
    // 12.149999999999999 em ponto flutuante e a trava recusaria por um fio.
    saldoDisponivel = 2.43;
    const res = await postPcp(req(pedraPcp));
    expect(res.status).toBe(201);
  });

  it("CASO REAL PD1019 / PCP #1130: saldo 0,414 g e pedido 0,414 g (2,07 ct) → passa", async () => {
    // O apontamento que estava sendo recusado com "Disponível: 0.4140ct,
    // solicitado: 2.0700ct" enquanto o estoque inteiro (20 pedras) estava lá.
    saldoDisponivel = 0.414;
    const res = await postPcp(req({ ...pedraPcp, peso_g_pedra: 0.414, peso_ct: 2.07 }));
    expect(res.status).toBe(201);
    expect(insertDe("apontamentos_pcp").values[7]).toBe(2.07); // peso_ct = 0,414 / 0,2
  });

  it("NEGATIVO do PD1019: saldo 0,4 g (2,00 ct) < 2,07 ct pedidos → 422", async () => {
    // Prova que a trava continua barrando de verdade. Sem este par, o teste de
    // cima passaria mesmo com a trava desligada.
    saldoDisponivel = 0.4;
    const res = await postPcp(req({ ...pedraPcp, peso_g_pedra: 0.414, peso_ct: 2.07 }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("2.0000ct");
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO"))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Distribuição
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/distribuicao/apontamentos — pedra por peso", () => {
  const pedraDist = {
    distribuicao_id: 42,
    tipo_apontamento_id: 3,
    deposito_id: 7,
    setor_id: null,
    insumo_id: 1352,
    peso_g_pedra: 2.43,
    peso_ct: 12.15,
    foto_balanca: "apontamentos/y.jpg",
  };

  it("tipo 3 com peso e SEM qtd → 201 e GRAVA peso_ct (antes era descartado)", async () => {
    const res = await postDist(req(pedraDist));
    expect(res.status).toBe(201);

    // Ordem: distribuicao_id, tipo, deposito, setor, insumo, qtd, peso_ct, ...
    const { values } = insertDe("apontamentos_distribuicao");
    expect(values[5]).toBe(2.43);   // qtd = peso em gramas
    expect(values[6]).toBe(12.15);  // peso_ct — é o que o gatilho lê p/ mover estoque
  });

  it("REGRESSÃO: insumo comum (tipo 2) sem qtd → 400", async () => {
    const res = await postDist(req({
      distribuicao_id: 42, tipo_apontamento_id: 2, deposito_id: 7, insumo_id: 10,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("qtd é obrigatório");
  });

  it("pedra sem saldo → 422 em ct (antes comparava peso contra contagem de peças)", async () => {
    saldoDisponivel = 1; // 1 g = 5 ct, menos que os 12,15 ct pedidos
    const res = await postDist(req(pedraDist));
    expect(res.status).toBe(422);
    const { error } = await res.json();
    expect(error).toContain("5.0000ct");
    expect(error).toContain("1.0000g");
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO"))).toBe(false);
  });

  it("saldo em grama EXATAMENTE igual ao pedido em ct → passa", async () => {
    saldoDisponivel = 2.43; // = 12,15 ct
    const res = await postDist(req(pedraDist));
    expect(res.status).toBe(201);
  });

  it("NEGATIVO: saldo 2,42 g (12,10 ct) < 12,15 ct pedidos → 422", async () => {
    saldoDisponivel = 2.42;
    const res = await postDist(req(pedraDist));
    expect(res.status).toBe(422);
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO"))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Guarda de esquema
// ══════════════════════════════════════════════════════════════════════════════
describe("nenhuma rota consulta movimentacoes_estoque.peso_ct", () => {
  /**
   * alissonerp.movimentacoes_estoque NÃO tem coluna peso_ct — nenhuma migration
   * cria. Uma versão anterior da trava de saldo consultava essa coluna e o
   * Postgres derrubava a rota inteira ('column "peso_ct" does not exist'), o que
   * transformaria o apontamento de pedra em erro 500. Este teste reprova quem
   * reintroduzir a consulta.
   */
  it("PCP e Distribuição só olham a vw_saldo_estoque", async () => {
    await postPcp(req({
      tipo_apontamento_id: 3, deposito_id: 7, insumo_id: 1352, pcp_id: 1136, peso_g_pedra: 2.43,
    }));
    await postDist(req({
      distribuicao_id: 42, tipo_apontamento_id: 3, deposito_id: 7, insumo_id: 1352, peso_g_pedra: 2.43,
    }));

    const suspeitas = sqlCalls.filter(
      (c) => c.text.includes("movimentacoes_estoque") && c.text.includes("peso_ct"),
    );
    expect(suspeitas).toEqual([]);
    expect(sqlCalls.some((c) => c.text.includes("vw_saldo_estoque"))).toBe(true);
  });
});
