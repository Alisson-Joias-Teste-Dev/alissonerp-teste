/**
 * ANTI-VOLTA (BLOCO 2, jul/2026 — P2, defesa em profundidade além de (a)).
 *
 * eventoDaTarefa já ignora a tag `frete_pagante:loja` (usa
 * entregas_venda.pagante — ver evento-da-tarefa.test.ts e
 * aprovacao-frete-avulso-autorizacao.test.ts). Mas o CAMPO `tarefas.tipo`
 * ainda decide SE existe evento — trocar tipo='frete_avulso' por outra coisa
 * faz eventoDaTarefa devolver null, e a exclusão do solicitante em
 * `ehAprovadorGravado` (aprovacao/route.ts) só se aplica quando
 * tarefaInfo.tipo === 'frete_avulso'. Sem travar `tags`/`tipo` aqui, o
 * solicitante (isOwner inclui criado_por) escaparia da correção do P1 editando
 * o `tipo` da própria tarefa antes de decidir.
 *
 * Este arquivo prova que PATCH /api/tarefas/[id] recusa (409) tentativas de
 * mexer em `tags` OU `tipo` enquanto a tarefa é 'frete_avulso' com aprovação
 * pendente — e que outros campos (ex.: prioridade) continuam editáveis
 * normalmente nesse mesmo cenário.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/notificacoes", () => ({
  criarNotificacao: vi.fn(async () => {}),
}));

// eventoDaTarefa/podeDecidir só são usados pelo GET desta rota — o PATCH sob
// teste aqui não os chama, mas o módulo os importa; deixamos reais
// (importOriginal) por segurança e simplicidade.
vi.mock("@/lib/aprovacoes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/aprovacoes")>()),
}));

const { PATCH } = await import("@/app/api/tarefas/[id]/route");

const TAREFA_ID = 30;
const SOLICITANTE_ID = "solicitante-dono-da-tarefa";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: String(TAREFA_ID) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: SOLICITANTE_ID } } });
});

describe("PATCH /api/tarefas/[id] — trava tags/tipo do frete avulso com aprovação pendente", () => {
  it("tentar editar `tags` numa tarefa frete_avulso com aprovação pendente → 409, nenhum UPDATE roda", async () => {
    sqlMock
      .mockResolvedValueOnce([{ // SELECT tarefaPatch
        responsavel_id: "outro-uuid", criado_por: SOLICITANTE_ID, status: "aguardando_aprovacao",
        titulo: "Frete avulso", tipo: "frete_avulso",
      }])
      .mockResolvedValueOnce([{ role: "consultora" }]) // SELECT usuarioPatch
      .mockResolvedValueOnce([{ 1: 1 }]);              // SELECT aprovacoes_tarefa pendente → existe

    const res = await PATCH(
      makeRequest({ tags: ["aprovacao_frete_avulso"] }),
      makeParams(),
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/tags e tipo não podem ser alterados/i);
    // Só as 3 leituras pré-checagem — nenhum UPDATE alissonerp.tarefas chegou a rodar.
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it("tentar editar `tipo` (pra escapar da exclusão de auto-aprovação) → 409 também", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        responsavel_id: "outro-uuid", criado_por: SOLICITANTE_ID, status: "aguardando_aprovacao",
        titulo: "Frete avulso", tipo: "frete_avulso",
      }])
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([{ 1: 1 }]);

    const res = await PATCH(makeRequest({ tipo: "geral" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/tags e tipo não podem ser alterados/i);
  });

  it("SEM aprovação pendente (já decidida) → editar tags/tipo passa normalmente", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        responsavel_id: "outro-uuid", criado_por: SOLICITANTE_ID, status: "aprovada",
        titulo: "Frete avulso", tipo: "frete_avulso",
      }])
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValueOnce([]) // SELECT aprovacoes_tarefa pendente → NENHUMA (já decidida)
      .mockResolvedValueOnce([]) // UPDATE alissonerp.tarefas
      .mockResolvedValue([]);

    const res = await PATCH(makeRequest({ tags: ["arquivo"] }), makeParams());
    expect(res.status).toBe(200);
  });

  it("editar outro campo (prioridade) numa tarefa frete_avulso com aprovação pendente → passa normalmente (trava é só tags/tipo)", async () => {
    sqlMock
      .mockResolvedValueOnce([{
        responsavel_id: "outro-uuid", criado_por: SOLICITANTE_ID, status: "aguardando_aprovacao",
        titulo: "Frete avulso", tipo: "frete_avulso",
      }])
      .mockResolvedValueOnce([{ role: "consultora" }])
      .mockResolvedValue([]);

    const res = await PATCH(makeRequest({ prioridade: "alta" }), makeParams());
    expect(res.status).toBe(200);
  });
});
