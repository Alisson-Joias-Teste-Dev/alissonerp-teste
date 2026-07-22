/**
 * Teste ANTI-VOLTA — BLOCO 5 (jul/2026), P2: quem CRIA uma tarefa (ex.:
 * consultora solicitando frete avulso) não tinha NENHUMA visão que mostrasse
 * o próprio pedido depois que ele saía da fila do aprovador — "minhas" só
 * olha responsavel_id, "aguardando" idem, e "concluidas" não aceita status
 * 'rejeitada'. Se a solicitação fosse RECUSADA, sumia de vez.
 *
 * Fix: nova visão `visao=solicitadas` em GET /api/tarefas — filtra só por
 * `t.criado_por`, em QUALQUER status. Escopada (não mexe em "minhas"/
 * "aguardando"/"time"/default) de propósito — ver comentário na rota.
 *
 * Estratégia: como a query principal é UM `sql` tagged-template gigante com
 * várias fragments construídas por `sql` ANTES da chamada final (cada uma é
 * uma invocação separada do mock), a forma confiável de provar "qual
 * condição foi escolhida" é inspecionar o TEXTO (strings literais) de cada
 * chamada ao `sql` mockado — não o resultado (que é sempre mockado). Mesma
 * ideia de "spy na construção da query" já usada nos testes de
 * frete-avulso-invariantes-route.test.ts (lá por estado; aqui por texto,
 * porque o que muda entre os casos é QUAL fragmento/condição é montado, não
 * o valor devolvido pelo banco).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function textoDaChamada(args: unknown[]): string {
  const strings = args[0] as TemplateStringsArray;
  return Array.isArray(strings) ? strings.join("¿") : "";
}

let usuarioAtual: { role: string } | null = { role: "consultora" };
const sqlCalls: unknown[][] = [];
const sqlMock = vi.fn((...args: unknown[]) => {
  sqlCalls.push(args);
  const texto = textoDaChamada(args);
  if (texto.includes("FROM alissonerp.usuarios")) {
    return Promise.resolve(usuarioAtual ? [usuarioAtual] : []);
  }
  // Query principal (SELECT t.id, t.titulo ... FROM alissonerp.tarefas t) e
  // qualquer fragmento — conteúdo não importa pros testes de SELEÇÃO DE
  // FILTRO abaixo, só a FORMA da query (o texto) importa.
  return Promise.resolve([]);
});
vi.mock("@/lib/db", () => ({ default: (...args: unknown[]) => sqlMock(...args) }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));

const { GET } = await import("@/app/api/tarefas/route");

const USER_ID = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  sqlCalls.length = 0;
  usuarioAtual = { role: "consultora" };
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "u@x.com" } } });
});

/** Fragmento EXATO da nova visão: "AND (t.criado_por = $1::uuid)" — sem OR. */
function usouFragmentoSolicitadas(): boolean {
  return sqlCalls.some((args) => {
    const t = textoDaChamada(args);
    return t.startsWith("AND (t.criado_por = ") && t.endsWith("::uuid)");
  });
}

describe("GET /api/tarefas?visao=solicitadas (BLOCO 5, P2)", () => {
  it("filtra por criado_por (o fragmento isolado da nova visão é construído)", async () => {
    const req = new NextRequest("http://localhost/api/tarefas?visao=solicitadas");
    await GET(req);

    expect(usouFragmentoSolicitadas()).toBe(true);
  });

  it("responde 200 (não quebra, não exige ser admin/aprovador)", async () => {
    const req = new NextRequest("http://localhost/api/tarefas?visao=solicitadas");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("visao=solicitadas NÃO polui as visões existentes (escopo, BLOCO 5 P2)", () => {
  it("visao=minhas continua responsavel_id-only — o fragmento de 'solicitadas' NÃO é construído", async () => {
    const req = new NextRequest("http://localhost/api/tarefas?visao=minhas");
    await GET(req);

    expect(usouFragmentoSolicitadas()).toBe(false);
  });

  it("visao=aguardando continua igual — o fragmento de 'solicitadas' NÃO é construído", async () => {
    const req = new NextRequest("http://localhost/api/tarefas?visao=aguardando");
    await GET(req);

    expect(usouFragmentoSolicitadas()).toBe(false);
  });

  it("sem visao (default, não-admin) continua no comportamento antigo (responsavel/criado_por/multiAprovador combinados) — não usa o fragmento ISOLADO novo", async () => {
    const req = new NextRequest("http://localhost/api/tarefas");
    await GET(req);

    expect(usouFragmentoSolicitadas()).toBe(false);
  });
});
