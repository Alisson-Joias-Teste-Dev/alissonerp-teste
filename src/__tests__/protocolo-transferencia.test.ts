/**
 * Testes do PROTOCOLO DE TRANSFERÊNCIA DE ESTOQUE (migration 369).
 *
 * O que este arquivo garante que NÃO volta a acontecer:
 *   1. Peça prometida a outro local continuar vendável no PDV — a solicitação
 *      TEM que criar reserva na origem.
 *   2. Reserva ficar pendurada depois que a peça já saiu (dupla contagem) ou
 *      depois de um cancelamento (peça presa fora do estoque para sempre).
 *   3. O trajeto sem transporte (Reposição → Loja, mesmo prédio — 210 das 271
 *      transferências existentes) não registrar a SAÍDA: a chegada precisa
 *      fazer saída e entrada no mesmo ato.
 *   4. Quem não é transportador dar o "peguei", ou duas pessoas coletarem o
 *      mesmo protocolo.
 *   5. Protocolo de transferência ser gravado com direcao='volta' — isso
 *      dispararia fn_reposicao_entrada_volta e o sumiria da aba Ida.
 *
 * O QUE ESTE ARQUIVO NÃO COBRE (declarado de propósito): o efeito no SALDO em
 * si. Quem move estoque são os gatilhos de transferencias_estoque_comercial
 * (fn_transferencia_ec_envio / _recebimento), que são banco — foram exercitados
 * por SQL em homolog, com os números conferidos passo a passo, e estão na
 * descrição do PR. Aqui provamos que o CÓDIGO cria, conclui e cancela as linhas
 * certas, na hora certa, para as pessoas certas.
 *
 * LIMITAÇÃO DO MOCK: o mock de @/lib/db não mantém estado relacional — ele
 * responde por PADRÃO da query (roteador abaixo), como o resto da suíte faz com
 * retornos empilhados. Serve para afirmar "esta query rodou / não rodou, com
 * estes valores", não para simular o banco.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OUTRO_USER = "22222222-2222-4222-8222-222222222222";
const PROTOCOLO_ID = 900;
const PRODUTO_A = 5001;
const PRODUTO_B = 5002;
const LOJA = 2;
const FABRICA = 1;
const EM_TRANSITO = 6;

/** Estado que cada teste ajusta antes de chamar a rota. */
let cenario: {
  role: string;
  tiposPermitidos: string[];
  disponivel: number;
  protocolo: Record<string, unknown> | null;
  itens: { produto_id: number; quantidade: number }[];
  transferenciasPendentes: { id: number }[];
  transferenciasConcluidas: { id: number }[];
  ehTransportador: boolean;
};

/** Registra toda query executada, para as asserções. */
let queries: { sql: string; values: unknown[] }[];

function sqlDe(strings: TemplateStringsArray | string[]): string {
  return Array.isArray(strings) ? strings.join(" ? ") : String(strings);
}

/** Todas as queries que casam com o trecho procurado. */
function queriesCom(trecho: string) {
  return queries.filter((q) => q.sql.replace(/\s+/g, " ").includes(trecho));
}

function rodou(trecho: string) {
  return queriesCom(trecho).length > 0;
}

const sqlMock = Object.assign(
  vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = sqlDe(strings).replace(/\s+/g, " ");
    queries.push({ sql, values });

    if (sql.includes("tipos_protocolo_permitidos")) {
      return Promise.resolve([{ role: cenario.role, tipos_protocolo_permitidos: cenario.tiposPermitidos }]);
    }
    if (sql.includes("is_transportador")) {
      return Promise.resolve([{ is_transportador: cenario.ehTransportador }]);
    }
    if (sql.includes("FROM alissonerp.locais_estoque WHERE id IN")) {
      const pedidos = values.flat() as number[];
      const catalogo: Record<number, { id: number; nome: string; ativo: boolean; parent_local_id: number | null }> = {
        [LOJA]:        { id: LOJA,        nome: "Loja",        ativo: true, parent_local_id: null },
        [FABRICA]:     { id: FABRICA,     nome: "Fabrica",     ativo: true, parent_local_id: null },
        [EM_TRANSITO]: { id: EM_TRANSITO, nome: "Em Transito", ativo: true, parent_local_id: null },
      };
      return Promise.resolve(pedidos.map((id) => catalogo[id]).filter(Boolean));
    }
    if (sql.includes("vw_saldo_estoque_comercial_v2")) {
      return Promise.resolve([{ disponivel: cenario.disponivel, sku: "AJ0001", nome_produto: "Anel", reservado_por_este: 0 }]);
    }
    if (sql.includes("INSERT INTO alissonerp.protocolos")) {
      return Promise.resolve([{ id: PROTOCOLO_ID }]);
    }
    if (sql.includes("FROM alissonerp.protocolos")) {
      return Promise.resolve(cenario.protocolo ? [cenario.protocolo] : []);
    }
    if (sql.includes("FROM alissonerp.protocolo_produtos")) {
      return Promise.resolve(cenario.itens);
    }
    if (sql.includes("INSERT INTO alissonerp.transferencias_estoque_comercial")) {
      return Promise.resolve([{ id: 777 }]);
    }
    if (sql.includes("FROM alissonerp.transferencias_estoque_comercial")) {
      return Promise.resolve(sql.includes("'concluido'") ? cenario.transferenciasConcluidas : cenario.transferenciasPendentes);
    }
    return Promise.resolve([]);
  }),
  {
    array: (arr: unknown[]) => arr,
    begin: (fn: (tx: unknown) => unknown) => fn(sqlMock),
  }
);
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const authUser = { id: USER_ID, role: "gerente_loja", email: "t@x.com" };
vi.mock("@/lib/auth-server", () => ({
  requireAuth: vi.fn(async () => authUser),
  authOr401: vi.fn(async () => [authUser, null]),
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn(), ensureBucket: vi.fn() }));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────
const { POST: postProtocolo } = await import("@/app/api/protocolo/route");
const { POST: postColeta } = await import("@/app/api/protocolo/[protocoloId]/coleta/route");
const { PATCH: patchProtocolo } = await import("@/app/api/protocolo/[protocoloId]/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(url: string, body: Record<string, unknown>, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params() {
  return { params: Promise.resolve({ protocoloId: String(PROTOCOLO_ID) }) };
}

const solicitacaoValida = {
  tipo_protocolo: "transferencia",
  local_origem_id: LOJA,
  local_destino_id: FABRICA,
  itens: [
    { produto_id: PRODUTO_A, quantidade: 2 },
    { produto_id: PRODUTO_B, quantidade: 1 },
  ],
};

beforeEach(() => {
  queries = [];
  authUser.id = USER_ID;
  authUser.role = "gerente_loja";
  cenario = {
    role: "gerente_loja",
    tiposPermitidos: ["fabrica", "transferencia"],
    disponivel: 10,
    protocolo: null,
    itens: [
      { produto_id: PRODUTO_A, quantidade: 2 },
      { produto_id: PRODUTO_B, quantidade: 1 },
    ],
    transferenciasPendentes: [],
    transferenciasConcluidas: [],
    ehTransportador: true,
  };
  sqlMock.mockClear();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. SOLICITAÇÃO
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/protocolo — solicitação de transferência", () => {
  it("reserva cada peça no local de ORIGEM (é o que impede vender no PDV)", async () => {
    const res = await postProtocolo(req("/api/protocolo", solicitacaoValida));
    expect(res.status).toBe(200);

    const reservas = queriesCom("INSERT INTO alissonerp.reservas_estoque_comercial");
    expect(reservas).toHaveLength(2);
    // produto, quantidade, local, protocolo, created_by (o status 'ativo' é
    // literal na query, não valor interpolado — conferido logo abaixo)
    expect(reservas[0].values).toEqual([PRODUTO_A, 2, LOJA, PROTOCOLO_ID, USER_ID]);
    expect(reservas[1].values).toEqual([PRODUTO_B, 1, LOJA, PROTOCOLO_ID, USER_ID]);
    expect(reservas[0].sql).toContain("'ativo'");
  });

  it("NÃO mexe no estoque na solicitação — a peça ainda está na prateleira", async () => {
    await postProtocolo(req("/api/protocolo", solicitacaoValida));
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
    expect(rodou("INSERT INTO alissonerp.movimentacoes_estoque_comercial")).toBe(false);
  });

  it("grava direcao='ida' e guarda o trajeto (nunca 'volta')", async () => {
    await postProtocolo(req("/api/protocolo", solicitacaoValida));
    const insert = queriesCom("INSERT INTO alissonerp.protocolos")[0];
    expect(insert.sql).toContain("'ida'");
    expect(insert.sql).not.toContain("'volta'");
    expect(insert.values).toContain(LOJA);
    expect(insert.values).toContain(FABRICA);
  });

  it("nasce SEM dono — quem transporta só se sabe na coleta", async () => {
    await postProtocolo(req("/api/protocolo", solicitacaoValida));
    const insert = queriesCom("INSERT INTO alissonerp.protocolos")[0];
    expect(insert.sql).toContain("'ida', 'pendente', NULL");
    expect(insert.values).not.toContain(OUTRO_USER);
  });

  it("ignora motoboy_id enviado no corpo — a solicitação não escolhe quem leva", async () => {
    await postProtocolo(req("/api/protocolo", { ...solicitacaoValida, motoboy_id: OUTRO_USER }));
    const insert = queriesCom("INSERT INTO alissonerp.protocolos")[0];
    expect(insert.values).not.toContain(OUTRO_USER);
  });

  it("recusa sem trajeto", async () => {
    const res = await postProtocolo(req("/api/protocolo", { ...solicitacaoValida, local_destino_id: undefined }));
    expect(res.status).toBe(400);
    expect(rodou("INSERT INTO alissonerp.protocolos")).toBe(false);
  });

  it("recusa origem igual ao destino", async () => {
    const res = await postProtocolo(req("/api/protocolo", { ...solicitacaoValida, local_destino_id: LOJA }));
    expect(res.status).toBe(400);
    expect(rodou("INSERT INTO alissonerp.protocolos")).toBe(false);
  });

  it("recusa 'Em Trânsito' como destino — trânsito não é local de saldo", async () => {
    const res = await postProtocolo(req("/api/protocolo", { ...solicitacaoValida, local_destino_id: EM_TRANSITO }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Em Transito") });
    expect(rodou("INSERT INTO alissonerp.protocolos")).toBe(false);
  });

  it("recusa quando o disponível na origem não cobre o pedido", async () => {
    cenario.disponivel = 1; // pedido: 2
    const res = await postProtocolo(req("/api/protocolo", solicitacaoValida));
    expect(res.status).toBe(409);
    expect(rodou("INSERT INTO alissonerp.reservas_estoque_comercial")).toBe(false);
  });

  it("recusa quem não tem o tipo liberado na tela de permissões", async () => {
    cenario.role = "consultora";
    cenario.tiposPermitidos = ["fabrica"];
    const res = await postProtocolo(req("/api/protocolo", solicitacaoValida));
    expect(res.status).toBe(403);
    expect(rodou("INSERT INTO alissonerp.protocolos")).toBe(false);
  });

  it("libera quem TEM o tipo liberado, mesmo sem ser gerente", async () => {
    cenario.role = "consultora";
    cenario.tiposPermitidos = ["transferencia"];
    const res = await postProtocolo(req("/api/protocolo", solicitacaoValida));
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. COLETA (motoboy)
// ══════════════════════════════════════════════════════════════════════════════
describe("POST /api/protocolo/[id]/coleta — a peça sai da origem", () => {
  beforeEach(() => {
    authUser.role = "motoboy";
    authUser.id = OUTRO_USER;
    cenario.ehTransportador = true;
    // Solicitação ainda sem dono: qualquer transportador pode pegar.
    cenario.protocolo = {
      id: PROTOCOLO_ID,
      tipo_protocolo: "transferencia",
      etapas: "pendente",
      motoboy_id: null,
      local_origem_id: LOJA,
      local_destino_id: FABRICA,
    };
  });

  it("grava QUEM levou — é na coleta que se sabe, não na solicitação", async () => {
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "coleta/1.jpg" }), params());
    expect(res.status).toBe(200);
    const marca = queriesCom("SET motoboy_id")[0];
    expect(marca).toBeDefined();
    expect(marca.values).toContain(OUTRO_USER);
  });

  it("recusa quem não está cadastrado como transportador", async () => {
    cenario.ehTransportador = false;
    authUser.role = "consultora";
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "x.jpg" }), params());
    expect(res.status).toBe(403);
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
  });

  it("recusa se outra pessoa já pegou as peças", async () => {
    cenario.protocolo!.motoboy_id = "33333333-3333-4333-8333-333333333333";
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "x.jpg" }), params());
    expect(res.status).toBe(409);
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
  });

  it("cria uma transferência por item e EFETIVA as reservas", async () => {
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "coleta/1.jpg" }), params());
    expect(res.status).toBe(200);

    const criadas = queriesCom("INSERT INTO alissonerp.transferencias_estoque_comercial");
    expect(criadas).toHaveLength(2);
    expect(criadas[0].values).toEqual([PRODUTO_A, 2, LOJA, FABRICA, `Protocolo #${PROTOCOLO_ID}`, PROTOCOLO_ID, OUTRO_USER]);

    const efetiva = queriesCom("SET status = 'efetivado'")[0];
    expect(efetiva).toBeDefined();
    expect(efetiva.values).toEqual([PROTOCOLO_ID]);
  });

  it("NÃO conclui o protocolo — quem confirma a chegada é o destino", async () => {
    await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "coleta/1.jpg" }), params());
    expect(rodou("SET etapas = 'concluido'")).toBe(false);
  });

  it("exige foto", async () => {
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, {}), params());
    expect(res.status).toBe(400);
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
  });

  it("recusa coleta repetida (duplo-clique não baixa o estoque duas vezes)", async () => {
    cenario.transferenciasPendentes = [{ id: 777 }];
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "x.jpg" }), params());
    expect(res.status).toBe(409);
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
  });

  it("recusa protocolo que não é de transferência", async () => {
    cenario.protocolo!.tipo_protocolo = "fabrica";
    const res = await postColeta(req(`/api/protocolo/${PROTOCOLO_ID}/coleta`, { foto_path: "x.jpg" }), params());
    expect(res.status).toBe(409);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. RECEBIMENTO
// ══════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/protocolo/[id] — chegada no destino", () => {
  beforeEach(() => {
    cenario.protocolo = {
      id: PROTOCOLO_ID,
      tipo_protocolo: "transferencia",
      etapas: "pendente",
      created_by: OUTRO_USER,
      local_origem_id: LOJA,
      local_destino_id: FABRICA,
    };
  });

  it("conclui as transferências que já estavam em rota, sem criar outras", async () => {
    cenario.transferenciasPendentes = [{ id: 777 }, { id: 778 }];
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "concluido", foto_conclusao: "chegada.jpg" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(200);
    expect(rodou("INSERT INTO alissonerp.transferencias_estoque_comercial")).toBe(false);
    expect(rodou("SET status = 'concluido'")).toBe(true);
    expect(rodou("SET etapas = 'concluido'")).toBe(true);
  });

  it("trajeto SEM motoboy: registra a saída e a entrada no mesmo ato", async () => {
    cenario.transferenciasPendentes = [];
    cenario.transferenciasConcluidas = [];
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "concluido", foto_conclusao: "chegada.jpg" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(200);
    // a saída que não existia é criada agora...
    expect(queriesCom("INSERT INTO alissonerp.transferencias_estoque_comercial")).toHaveLength(2);
    // ...e imediatamente concluída (entrada no destino)
    expect(rodou("SET status = 'concluido'")).toBe(true);
    // e a reserva da solicitação não fica pendurada
    expect(rodou("SET status = 'efetivado'")).toBe(true);
  });

  it("exige foto da chegada", async () => {
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "concluido" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(400);
    expect(rodou("SET etapas = 'concluido'")).toBe(false);
  });

  it("recusa quem não pode concluir protocolo", async () => {
    authUser.role = "consultora";
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "concluido", foto_conclusao: "x.jpg" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(403);
    expect(rodou("SET etapas = 'concluido'")).toBe(false);
  });

  it("recusa receber protocolo que já foi fechado", async () => {
    cenario.protocolo!.etapas = "concluido";
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "concluido", foto_conclusao: "x.jpg" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(409);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CANCELAMENTO
// ══════════════════════════════════════════════════════════════════════════════
describe("PATCH /api/protocolo/[id] — cancelamento", () => {
  beforeEach(() => {
    cenario.protocolo = {
      id: PROTOCOLO_ID,
      tipo_protocolo: "transferencia",
      etapas: "pendente",
      created_by: OUTRO_USER,
      local_origem_id: LOJA,
      local_destino_id: FABRICA,
    };
  });

  it("solta a reserva — senão a peça fica presa fora do estoque para sempre", async () => {
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "cancelado", motivo_cancelamento: "cliente desistiu" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(200);
    const solta = queriesCom("SET status = 'cancelado', cancelado_em = now()")[0];
    expect(solta).toBeDefined();
    expect(solta.values).toEqual([PROTOCOLO_ID]);
  });

  it("cancela também a transferência, se a peça já tinha saído", async () => {
    cenario.transferenciasPendentes = [{ id: 777 }];
    await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "cancelado", motivo_cancelamento: "voltou" }, "PATCH"),
      params()
    );
    expect(rodou("SET status = 'cancelado' WHERE protocolo_id")).toBe(true);
  });

  it("exige motivo", async () => {
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "cancelado", motivo_cancelamento: "   " }, "PATCH"),
      params()
    );
    expect(res.status).toBe(400);
    expect(rodou("SET etapas = 'cancelado'")).toBe(false);
  });

  it("quem solicitou pode cancelar mesmo sem ser gerente", async () => {
    authUser.role = "consultora";
    authUser.id = OUTRO_USER; // é o created_by
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "cancelado", motivo_cancelamento: "desistiu" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(200);
  });

  it("estranho ao protocolo não cancela", async () => {
    authUser.role = "consultora";
    authUser.id = "44444444-4444-4444-8444-444444444444";
    const res = await patchProtocolo(
      req(`/api/protocolo/${PROTOCOLO_ID}`, { etapas: "cancelado", motivo_cancelamento: "xx" }, "PATCH"),
      params()
    );
    expect(res.status).toBe(403);
  });
});
