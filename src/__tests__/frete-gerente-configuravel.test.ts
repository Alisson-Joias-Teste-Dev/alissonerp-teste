/**
 * Teste ANTI-VOLTA — BLOCO 1 (verba de frete grátis, gerente configurável).
 *
 * O bug que este arquivo prova que não acontece: a gerente dona do saldo de
 * frete grátis sendo escolhida ARBITRARIAMENTE (`WHERE role='gerente_loja'
 * AND ativo=true ORDER BY created_at LIMIT 1`) mesmo quando a chave de
 * config `gerente_frete_gratis` já foi preenchida — ou, na direção oposta,
 * a função quebrando (em vez de cair no fallback antigo) quando a chave
 * ainda está vazia, o que mudaria o comportamento de produção sem o
 * Jonathan ter configurado nada ainda.
 *
 * Cobre `resolverGerenteFreteGratisId` (src/lib/entrega-venda.ts) — fonte
 * ÚNICA de leitura usada tanto por `lancarSaldoFreteAvulsoNoTx` quanto por
 * GET /api/entregas-venda/saldo-frete.
 *
 * Estratégia: a função recebe `db` como PARÂMETRO (não usa o `sql` default
 * de @/lib/db diretamente) — mas @/lib/entrega-venda.ts importa @/lib/db no
 * topo do arquivo (conexão postgres real), então mockamos o módulo mesmo
 * sem usá-lo, só para o import não tentar abrir conexão de verdade (mesmo
 * padrão de frete-avulso-invariantes-lib.test.ts). O `db` de teste em si é
 * um mock local de tagged template que responde em sequência às 2 possíveis
 * queries (config, depois fallback).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: vi.fn() }));

const { resolverGerenteFreteGratisId } = await import("@/lib/entrega-venda");

const FALLBACK_USER_ID = "11111111-1111-1111-1111-111111111111";
const GERENTE_CONFIGURADA_ID = "99999999-9999-9999-9999-999999999999";
const GERENTE_MAIS_ANTIGA_ID = "22222222-2222-2222-2222-222222222222";

/** Mock de tagged template — cada chamada consome o próximo valor da fila. */
function criarDbMock(respostas: unknown[][]) {
  const fila = [...respostas];
  return vi.fn((..._args: unknown[]) => Promise.resolve(fila.shift() ?? []));
}

describe("resolverGerenteFreteGratisId — BLOCO 1 (gerente configurável)", () => {
  it("chave `gerente_frete_gratis` PREENCHIDA → usa o UUID configurado, NÃO consulta o fallback antigo", async () => {
    const db = criarDbMock([
      [{ valor: GERENTE_CONFIGURADA_ID }], // SELECT valor FROM configuracoes_sistema
    ]);

    const gerenteId = await resolverGerenteFreteGratisId(db, FALLBACK_USER_ID);

    expect(gerenteId).toBe(GERENTE_CONFIGURADA_ID);
    // Só 1 query rodou — a busca do fallback (ORDER BY created_at) nem foi disparada.
    expect(db).toHaveBeenCalledTimes(1);
  });

  it("chave VAZIA (config sem linha) → cai no fallback antigo (gerente_loja mais antiga)", async () => {
    const db = criarDbMock([
      [], // SELECT valor FROM configuracoes_sistema — chave não existe
      [{ id: GERENTE_MAIS_ANTIGA_ID }], // fallback: ORDER BY created_at LIMIT 1
    ]);

    const gerenteId = await resolverGerenteFreteGratisId(db, FALLBACK_USER_ID);

    expect(gerenteId).toBe(GERENTE_MAIS_ANTIGA_ID);
    expect(db).toHaveBeenCalledTimes(2);
  });

  it("chave com valor em branco (\"\" ou espaços) → tratada como vazia, cai no fallback antigo", async () => {
    const db = criarDbMock([
      [{ valor: "   " }],
      [{ id: GERENTE_MAIS_ANTIGA_ID }],
    ]);

    const gerenteId = await resolverGerenteFreteGratisId(db, FALLBACK_USER_ID);

    expect(gerenteId).toBe(GERENTE_MAIS_ANTIGA_ID);
  });

  it("chave vazia E nenhum gerente_loja ativo cadastrado → usa o fallbackUserId (usuário logado)", async () => {
    const db = criarDbMock([
      [], // config vazia
      [], // nenhum gerente_loja ativo
    ]);

    const gerenteId = await resolverGerenteFreteGratisId(db, FALLBACK_USER_ID);

    expect(gerenteId).toBe(FALLBACK_USER_ID);
  });
});
