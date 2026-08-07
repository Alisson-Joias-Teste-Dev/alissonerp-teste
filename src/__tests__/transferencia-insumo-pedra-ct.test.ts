/**
 * Testes da transferência de insumo entre operadores — CONVERSÃO DE PEDRA.
 *
 * O BUG QUE ESTES TESTES TRANCAM:
 * A rota gravava no razão de estoque a quantidade digitada CRUA. Pedra é pesada
 * na balança em GRAMA, mas o estoque de pedra é controlado em QUILATE
 * (1 ct = 0,2 g) — é assim que ela entra por compra e sai por apontamento.
 * Resultado real (movimentação 3400, 07/08/2026): duas Mossanites de 1,2 g
 * entraram no Almoxarifado como "2,4" num razão em ct, onde deviam ser 12. O
 * apontamento seguinte foi barrado por saldo insuficiente, com a pedra na mão.
 *
 * Cobre:
 *  1. Pedra: grava ct nas DUAS pernas da dupla-entrada
 *  2. Insumo comum: continua gravando o número digitado (REGRESSÃO)
 *  3. Pedra: saldo conferido em ct, mensagem em ct
 *  4. Pedra: saldo que cobre exatamente o pedido passa
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

type SqlCall = { text: string; values: unknown[] };
const sqlCalls: SqlCall[] = [];

let categoriaDoInsumo = 2;   // 2 = pedra
let saldoDisponivel   = 1000;

const sqlMock = Object.assign(
  vi.fn((strings: TemplateStringsArray | string[], ...values: unknown[]): Promise<unknown[]> => {
    const text = Array.isArray(strings) ? strings.join("?") : String(strings);
    sqlCalls.push({ text, values });

    if (text.includes("is_operador_service")) {
      return Promise.resolve([{ role: "admin", deposito_id: 2, is_operador_service: true, nome: "Natan" }]);
    }
    if (text.includes("FROM alissonerp.depositos")) {
      return Promise.resolve([{ id: 3, nome: "Gilmar", local_estoque_id: 1 }]);
    }
    if (text.includes("categoria_id FROM alissonerp.insumos")) {
      return Promise.resolve([{ id: 282, nome: "Mossanite 12mm", categoria_id: categoriaDoInsumo }]);
    }
    if (text.includes("vw_saldo_estoque")) {
      return Promise.resolve([{ saldo: saldoDisponivel, deposito_id: 2 }]);
    }
    return Promise.resolve([]);
  }),
  {
    array: (arr: unknown[]) => arr,
    // A rota usa sql.begin(tx => ...) para a dupla-entrada.
    begin: (fn: (tx: unknown) => Promise<void>) => fn(sqlMock),
  },
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-teste", email: "t@x.com" } } }) },
  })),
}));

vi.mock("@/lib/roles", () => ({ isFullAccess: () => true }));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn(async () => ({ path: "fotos/x.jpg" })) }));
vi.mock("@/lib/ia-validar-peso", () => ({
  validarPesoBalanca: vi.fn(async () => ({ match: true, mensagem: "ok" })),
}));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST } = await import("@/app/api/service/transferir-insumo/route");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- só precisamos de req.json()
const req = (body: unknown): any => ({ json: async () => body });

const transferencia = {
  dest_deposito_id: 3,
  insumo_id: 282,
  quantidade: 2.4,                       // GRAMAS na balança = 12 ct
  foto_base64: "data:image/jpeg;base64,AAAA",
};

/** As duas pernas da dupla-entrada, na ordem: saída da origem, entrada no destino. */
function pernas(): SqlCall[] {
  return sqlCalls.filter((c) => c.text.includes("INSERT INTO alissonerp.movimentacoes_estoque"));
}

beforeEach(() => {
  sqlCalls.length = 0;
  categoriaDoInsumo = 2;
  saldoDisponivel = 1000;
});

describe("POST /api/service/transferir-insumo — pedra vai para o razão em ct", () => {
  it("pedra: 2,4 g viram 12 ct nas duas pernas", async () => {
    const res = await POST(req(transferencia));
    expect(res.status).toBe(200);

    const [saida, entrada] = pernas();
    expect(pernas()).toHaveLength(2);
    // Valores interpolados: insumo_id, deposito_id, local_estoque_id, QUANTIDADE, obs.
    // (o 0 e o marcador são literais no SQL, não entram na lista)
    expect(saida.values[3]).toBe(12);    // saída da origem, em ct
    expect(entrada.values[3]).toBe(12);  // entrada no destino, em ct
    // O número digitado (grama) não pode aparecer no razão.
    expect(saida.values).not.toContain(2.4);
    expect(entrada.values).not.toContain(2.4);
  });

  it("REGRESSÃO: insumo comum grava o número digitado, sem conversão", async () => {
    categoriaDoInsumo = 3; // nem ouro nem pedra
    const res = await POST(req({ ...transferencia, quantidade: 5.5 }));
    expect(res.status).toBe(200);

    const [saida, entrada] = pernas();
    expect(saida.values[3]).toBe(5.5);
    expect(entrada.values[3]).toBe(5.5);
  });

  it("pedra sem saldo: 422 comparando em ct", async () => {
    saldoDisponivel = 5;  // 5 ct, menos que os 12 ct pedidos
    const res = await POST(req(transferencia));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("ct");
    expect(pernas()).toHaveLength(0);
  });

  it("pedra com saldo exatamente igual ao pedido (12 ct) passa", async () => {
    // Se a trava comparasse a grama (2,4) contra o saldo, este teste passaria
    // por acidente — é o par do teste acima, que só barra se a conta for em ct.
    saldoDisponivel = 12;
    const res = await POST(req(transferencia));
    expect(res.status).toBe(200);
    expect(pernas()).toHaveLength(2);
  });
});
