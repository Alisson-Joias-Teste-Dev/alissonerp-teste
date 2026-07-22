/**
 * Teste ANTI-VOLTA — BLOCO 4 (jul/2026), P2: o aprovador do frete avulso
 * precisa ver o VALOR (frete_cobrado do cliente e frete_motoboy) antes de
 * decidir — não só quem paga e a foto do comprovante (BLOCO já existente,
 * 21/07). Sem isso, uma solicitação cara chega visualmente idêntica a uma
 * de R$ 20 e o aprovador libera "no automático".
 *
 * Prova que GET /api/tarefas/[id] expõe `frete_cobrado` e `frete_motoboy`
 * (join com entregas_venda por tarefa_aprovacao_id) já convertidos pra
 * number (NUMERIC vem como string do postgres.js — precisa virar number
 * pro front comparar com LIMITE_ALERTA_FRETE_MOTOBOY, ver
 * src/lib/frete-avulso-alerta.ts e seu teste dedicado
 * frete-avulso-alerta-limite.test.ts para o predicado do aviso em si).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));

// eventoDaTarefa fica REAL (função pura) — só podeDecidir é mockado, já que
// este teste usa role admin (isAdminOuDev) que não depende dele pra autorizar.
const mockPodeDecidir = vi.fn(async () => ({ pode: true }));
vi.mock("@/lib/aprovacoes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/aprovacoes")>()),
  podeDecidir: mockPodeDecidir,
}));

const { GET } = await import("@/app/api/tarefas/[id]/route");

const TAREFA_ID = 42;
const ADMIN_ID = "admin-uuid";

function makeParams() {
  return { params: Promise.resolve({ id: String(TAREFA_ID) }) };
}

function tarefaFreteAvulso(overrides: Record<string, unknown> = {}) {
  return {
    id: TAREFA_ID,
    titulo: "Frete avulso solicitado",
    descricao: null,
    prioridade: "media",
    status: "aguardando_aprovacao",
    tipo: "frete_avulso",
    data_limite: null,
    ordem_id: null,
    ordem_ids: null,
    peso_metal: null,
    tags: [],
    venda_id: null,
    posicao: 0,
    responsavel_id: "responsavel-uuid",
    criado_por: "solicitante-uuid",
    created_at: "2026-07-20T10:00:00Z",
    updated_at: null,
    concluida_em: null,
    responsavel_nome: "Responsável",
    criador_nome: "Solicitante",
    numero_ordem: null,
    aprovacao_credito_tipo: null,
    venda_situacao: null,
    frete_pagante: "cliente",
    frete_comprovante_pagante_path: "comprovante.jpg",
    frete_cobrado: "220.00",
    frete_motoboy: "180.00",
    ...overrides,
  };
}

function setupQueries(tarefa: Record<string, unknown>) {
  sqlMock
    .mockResolvedValueOnce([tarefa])                    // SELECT tarefa (com joins)
    .mockResolvedValueOnce([{ role: "admin" }])          // SELECT usuario
    .mockResolvedValueOnce([{ aprovador_id: ADMIN_ID }]) // SELECT aprovacoes_tarefa pendente
    .mockResolvedValueOnce([]);                          // SELECT comentarios
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
});

describe("GET /api/tarefas/[id] — expõe frete_cobrado e frete_motoboy (P2)", () => {
  it("tarefa de frete avulso → resposta traz frete_cobrado e frete_motoboy como NUMBER", async () => {
    setupQueries(tarefaFreteAvulso({ frete_cobrado: "220.00", frete_motoboy: "180.00" }));

    const res = await GET(new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.frete_cobrado).toBe(220);
    expect(data.frete_motoboy).toBe(180);
    expect(typeof data.frete_cobrado).toBe("number");
    expect(typeof data.frete_motoboy).toBe("number");
  });

  it("valor do motoboy ACIMA de R$ 200 → number > 200 (front sinaliza o alerta)", async () => {
    setupQueries(tarefaFreteAvulso({ frete_motoboy: "250.00" }));

    const res = await GET(new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}`), makeParams());
    const data = await res.json();

    expect(data.frete_motoboy).toBeGreaterThan(200);
  });

  it("valor do motoboy ABAIXO/IGUAL a R$ 200 → number <= 200 (front NÃO sinaliza)", async () => {
    setupQueries(tarefaFreteAvulso({ frete_motoboy: "200.00" }));

    const res = await GET(new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}`), makeParams());
    const data = await res.json();

    expect(data.frete_motoboy).toBeLessThanOrEqual(200);
  });

  it("tarefa sem entrega vinculada (join não bate) → frete_cobrado/frete_motoboy vêm null, não quebra", async () => {
    setupQueries(tarefaFreteAvulso({
      frete_pagante: null,
      frete_comprovante_pagante_path: null,
      frete_cobrado: null,
      frete_motoboy: null,
    }));

    const res = await GET(new NextRequest(`http://localhost/api/tarefas/${TAREFA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.frete_cobrado).toBeNull();
    expect(data.frete_motoboy).toBeNull();
  });
});
