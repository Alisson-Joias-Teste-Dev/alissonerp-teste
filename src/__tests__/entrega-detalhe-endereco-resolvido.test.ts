/**
 * Testes ANTI-VOLTA — BLOCO 4 (jul/2026), P1: o drawer de detalhe da
 * entrega tem que mostrar o endereço CONFIRMADO na solicitação de frete
 * avulso, não o da venda (bug original: GET /api/entregas-venda/[id] só
 * selecionava `ve.endereco_entrega*`, da venda — a migration 355 criou
 * colunas homônimas em `entregas_venda`, então o drawer sempre mostrava o
 * endereço da VENDA, mesmo quando a consultora confirmou outro na
 * solicitação; sem venda vinculada, aparecia "Endereço não informado na
 * venda" mesmo com o endereço da entrega gravado).
 *
 * REGRA: o endereço da ENTREGA manda se tiver QUALQUER campo próprio
 * preenchido — usa o conjunto DELA INTEIRO (nunca mistura rua da entrega
 * com bairro da venda). Só cai pro conjunto da VENDA quando a entrega não
 * tem NENHUM campo de endereço (entrega normal/não-avulsa).
 *
 * Cobre dois níveis:
 *   1. resolverEnderecoEntrega (função pura, src/lib/entrega-venda.ts).
 *   2. GET /api/entregas-venda/[id] fim a fim (mock de sql), provando que a
 *      rota usa a função acima e devolve o conjunto certo pro drawer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (compartilhados pelas duas partes deste arquivo) ──────────────────

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ default: sqlMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn() }));
vi.mock("@/lib/whatsapp", () => ({
  enviarCodigoWhatsAppDetalhado: vi.fn(),
  enviarCodigoClienteEmRota: vi.fn(),
  enviarConfirmacaoEntregaConcluida: vi.fn(),
  enviarAvisoDesenvolvedor: vi.fn(),
}));
vi.mock("@/lib/entrega-sem-pagamento", () => ({
  vendaEntregaDevendo: vi.fn(),
  vendaTemExcecaoEntregaAprovada: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

const { resolverEnderecoEntrega } = await import("@/lib/entrega-venda");
const { GET } = await import("@/app/api/entregas-venda/[id]/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "admin-uuid" } } });
});

// ── Parte 1 — função pura ────────────────────────────────────────────────────

const enderecoVazio = {
  endereco_entrega: null,
  endereco_entrega_numero: null,
  endereco_entrega_complemento: null,
  endereco_entrega_bairro: null,
  endereco_entrega_cidade: null,
  endereco_entrega_cep: null,
  endereco_entrega_uf: null,
};

const enderecoEntrega = {
  endereco_entrega: "Rua da Entrega",
  endereco_entrega_numero: "100",
  endereco_entrega_complemento: null,
  endereco_entrega_bairro: "Bairro da Entrega",
  endereco_entrega_cidade: "Fortaleza",
  endereco_entrega_cep: "60000-000",
  endereco_entrega_uf: "CE",
};

const enderecoVenda = {
  endereco_entrega: "Rua da Venda",
  endereco_entrega_numero: "200",
  endereco_entrega_complemento: "Ap 1",
  endereco_entrega_bairro: "Bairro da Venda",
  endereco_entrega_cidade: "Maracanaú",
  endereco_entrega_cep: "61900-000",
  endereco_entrega_uf: "CE",
};

describe("resolverEnderecoEntrega — regra de negócio pura", () => {
  it("entrega com endereço próprio + venda com endereço diferente → usa o conjunto INTEIRO da entrega (sem mistura)", () => {
    const resolvido = resolverEnderecoEntrega(enderecoEntrega, enderecoVenda);
    expect(resolvido).toEqual(enderecoEntrega);
    // Prova explícita de que não é Frankenstein: nenhum campo veio da venda.
    expect(resolvido.endereco_entrega_bairro).toBe("Bairro da Entrega");
    expect(resolvido.endereco_entrega_cidade).toBe("Fortaleza");
  });

  it("entrega SEM nenhum campo de endereço (venda vinculada) → cai pro conjunto da venda", () => {
    const resolvido = resolverEnderecoEntrega(enderecoVazio, enderecoVenda);
    expect(resolvido).toEqual(enderecoVenda);
  });

  it("entrega com endereço próprio e SEM venda (avulso sem venda_id) → usa o da entrega", () => {
    const resolvido = resolverEnderecoEntrega(enderecoEntrega, enderecoVazio);
    expect(resolvido).toEqual(enderecoEntrega);
  });

  it("entrega com só UM campo preenchido já basta pra usar o conjunto inteiro dela (não espera todos)", () => {
    const entregaParcial = { ...enderecoVazio, endereco_entrega: "Rua Mínima" };
    const resolvido = resolverEnderecoEntrega(entregaParcial, enderecoVenda);
    expect(resolvido).toEqual(entregaParcial);
    // Não pega bairro da venda pra completar — é o conjunto inteiro ou nada.
    expect(resolvido.endereco_entrega_bairro).toBeNull();
  });

  it("nem entrega nem venda têm endereço → devolve tudo null (front mostra 'Endereço não informado')", () => {
    const resolvido = resolverEnderecoEntrega(enderecoVazio, enderecoVazio);
    expect(resolvido).toEqual(enderecoVazio);
  });
});

// ── Parte 2 — rota GET /api/entregas-venda/[id] fim a fim ───────────────────

const ENTREGA_ID = 777;

function makeParams() {
  return { params: Promise.resolve({ id: String(ENTREGA_ID) }) };
}

/** Linha completa da query 1 (cabeçalho), com defaults neutros — override por teste. */
function linhaBase(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTREGA_ID,
    venda_id: null,
    codigo_entrega: "ABC123",
    codigo_cliente: "111111",
    codigo_motoboy: null,
    tipo: "total",
    forma_entrega: "motoboy",
    situacao: "pendente",
    regiao: "fortaleza",
    motoboy_id: null,
    frete_cobrado: "20.00",
    frete_motoboy: "15.00",
    aprovacao_frete_necessaria: false,
    data_saida: null,
    data_retirada: null,
    data_entrega_realizada: null,
    data_entrega_prevista: null,
    correios_rastreio: null,
    correios_data_postagem: null,
    observacoes: null,
    created_at: "2026-07-20T10:00:00Z",
    updated_at: null,
    foto_entrega_path: null,
    is_avulso: true,
    descricao_avulso: "Corrida avulsa",
    auto_criado: false,
    numero_venda: null,
    total_venda: null,
    venda_situacao: null,
    cliente_id: null,
    cliente_nome: null,
    cliente_celular: null,
    cliente_telefone: null,
    vendedor_id: null,
    // Endereço da VENDA (ve.*) — todos null por default (sem venda)
    endereco_entrega: null,
    endereco_entrega_numero: null,
    endereco_entrega_complemento: null,
    endereco_entrega_bairro: null,
    endereco_entrega_cidade: null,
    endereco_entrega_cep: null,
    endereco_entrega_uf: null,
    // Endereço da ENTREGA (ev.*, aliasado) — todos null por default
    entrega_endereco_entrega: null,
    entrega_endereco_entrega_numero: null,
    entrega_endereco_entrega_complemento: null,
    entrega_endereco_entrega_bairro: null,
    entrega_endereco_entrega_cidade: null,
    entrega_endereco_entrega_cep: null,
    entrega_endereco_entrega_uf: null,
    cliente_endereco: null,
    cliente_numero: null,
    cliente_complemento: null,
    cliente_bairro: null,
    cliente_municipio: null,
    cliente_cep: null,
    cliente_uf: null,
    motoboy_nome: null,
    motoboy_telefone: null,
    criado_por_nome: "Fulano",
    confirmado_motoboy_retirada_nome: null,
    confirmado_retirada_nome: null,
    confirmado_motoboy_entrega_nome: null,
    ...overrides,
  };
}

function setupQueries(linha: Record<string, unknown>) {
  sqlMock
    .mockResolvedValueOnce([{ role: "admin", vendedor_id: null }]) // usuario
    .mockResolvedValueOnce([linha])                                // Query 1 — cabeçalho
    .mockResolvedValueOnce([])                                     // Query 2 — itens
    .mockResolvedValueOnce([{ total: 0 }])                         // Query 3 — count
    .mockResolvedValueOnce([{ total: 0 }])                         // Query 4 — na_entrega_pendente
    .mockResolvedValueOnce([{ fotos: [] }]);                       // Query 5 (mig 357) — buscarFotosEntrega
}

describe("GET /api/entregas-venda/[id] — endereço resolvido (P1)", () => {
  it("avulso SEM venda + endereço próprio na entrega → resposta traz o endereço da ENTREGA", async () => {
    setupQueries(linhaBase({
      venda_id: null,
      entrega_endereco_entrega: "Rua da Entrega",
      entrega_endereco_entrega_numero: "100",
      entrega_endereco_entrega_bairro: "Bairro da Entrega",
      entrega_endereco_entrega_cidade: "Fortaleza",
      entrega_endereco_entrega_uf: "CE",
      entrega_endereco_entrega_cep: "60000-000",
    }));

    const res = await GET(new NextRequest(`http://localhost/api/entregas-venda/${ENTREGA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.endereco_entrega).toBe("Rua da Entrega");
    expect(data.endereco_entrega_bairro).toBe("Bairro da Entrega");
    expect(data.endereco_entrega_cidade).toBe("Fortaleza");
  });

  it("avulso COM venda vinculada, mas endereço da entrega DIVERGE do da venda → resposta traz o da ENTREGA (sem mistura)", async () => {
    setupQueries(linhaBase({
      venda_id: 999,
      numero_venda: "V-999",
      // Endereço da venda (não deve aparecer em nenhum campo da resposta)
      endereco_entrega: "Rua da Venda",
      endereco_entrega_numero: "200",
      endereco_entrega_bairro: "Bairro da Venda",
      endereco_entrega_cidade: "Maracanaú",
      endereco_entrega_uf: "CE",
      endereco_entrega_cep: "61900-000",
      // Endereço confirmado na solicitação da entrega
      entrega_endereco_entrega: "Rua da Entrega",
      entrega_endereco_entrega_numero: "100",
      entrega_endereco_entrega_bairro: "Bairro da Entrega",
      entrega_endereco_entrega_cidade: "Fortaleza",
      entrega_endereco_entrega_uf: "CE",
      entrega_endereco_entrega_cep: "60000-000",
    }));

    const res = await GET(new NextRequest(`http://localhost/api/entregas-venda/${ENTREGA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.endereco_entrega).toBe("Rua da Entrega");
    expect(data.endereco_entrega_bairro).toBe("Bairro da Entrega");
    expect(data.endereco_entrega_cidade).toBe("Fortaleza");
    // Nenhum campo "vazou" da venda — não é Frankenstein.
    expect(data.endereco_entrega).not.toBe("Rua da Venda");
    expect(data.endereco_entrega_bairro).not.toBe("Bairro da Venda");
  });

  it("entrega NORMAL (não-avulsa) sem endereço próprio → continua trazendo o endereço da VENDA", async () => {
    setupQueries(linhaBase({
      is_avulso: false,
      descricao_avulso: null,
      venda_id: 555,
      numero_venda: "V-555",
      endereco_entrega: "Rua da Venda",
      endereco_entrega_numero: "200",
      endereco_entrega_bairro: "Bairro da Venda",
      endereco_entrega_cidade: "Maracanaú",
      endereco_entrega_uf: "CE",
      endereco_entrega_cep: "61900-000",
      // Entrega normal nunca grava endereço próprio — tudo null (default de linhaBase)
    }));

    const res = await GET(new NextRequest(`http://localhost/api/entregas-venda/${ENTREGA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.endereco_entrega).toBe("Rua da Venda");
    expect(data.endereco_entrega_bairro).toBe("Bairro da Venda");
    expect(data.endereco_entrega_cidade).toBe("Maracanaú");
  });

  it("nem entrega nem venda têm endereço → todos os campos vêm null (front decide a mensagem)", async () => {
    setupQueries(linhaBase({ venda_id: null }));

    const res = await GET(new NextRequest(`http://localhost/api/entregas-venda/${ENTREGA_ID}`), makeParams());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.endereco_entrega).toBeNull();
    expect(data.endereco_entrega_bairro).toBeNull();
  });
});
