import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ANTI-VOLTA (BLOCO 2, jul/2026 — P1: auto-aprovação no frete avulso).
 *
 * O bug que este arquivo prova que NÃO acontece mais: `resolverAprovadores`/
 * `podeDecidir` (src/lib/aprovacoes/autoridade.ts) já excluíam `ctx.solicitanteId`
 * da lista de aprovadores — mas só quando o CALLER passava esse ctx. O portão
 * genérico do PATCH .../aprovacao (src/app/api/tarefas/[id]/aprovacao/route.ts)
 * chamava `podeDecidir(user, evento)` SEM ctx.solicitanteId pro frete avulso —
 * quem solicitou e também estava no pool decidia o próprio pedido.
 *
 * Este arquivo testa a CAMADA (autoridade.ts) com um mock mínimo de `@/lib/db`
 * simulando `configuracoes_sistema` (chave 'aprovadores_frete_avulso') e
 * `usuarios` (ativos). Quem testa que o ENDPOINT realmente passa
 * ctx.solicitanteId nos dois pontos certos é
 * src/__tests__/aprovacao-frete-avulso-autorizacao.test.ts (mocka podeDecidir).
 *
 * Cobre também a MENSAGEM CLARA exigida quando o pool fica vazio só porque o
 * único configurado era quem está solicitando (motivo
 * "aprovador_e_o_proprio_solicitante", distinto do genérico
 * "aprovador_nao_configurado" — ver comentário em tipos.ts/ResolucaoAprovador).
 */

const usuariosAtivos = new Set<string>();

const sqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join("?");
  if (query.includes("FROM alissonerp.configuracoes_unificado")) {
    // values[0] é o array de chaves (ANY(${chaves})) — duas chaves relevantes
    // nestes testes: aprovadores_frete_avulso (cliente) e
    // aprovadores_frete_avulso_loja (loja, auto-aprovação permitida desde 31/07).
    const chaves = values[0] as string[];
    if (chaves.includes("aprovadores_frete_avulso_loja")) {
      return [{ chave: "aprovadores_frete_avulso_loja", valor: (globalThis as { __configFreteAvulsoLoja?: string }).__configFreteAvulsoLoja ?? "" }];
    }
    if (chaves.includes("aprovadores_frete_avulso")) {
      return [{ chave: "aprovadores_frete_avulso", valor: (globalThis as { __configFreteAvulso?: string }).__configFreteAvulso ?? "" }];
    }
    return [];
  }
  if (query.includes("FROM alissonerp.usuarios")) {
    // values[0] é o UUID checado (usuarioAtivoPorId).
    const id = values[0] as string;
    return usuariosAtivos.has(id) ? [{ id }] : [];
  }
  return [];
});
vi.mock("@/lib/db", () => ({ default: sqlMock }));

const { podeDecidir, resolverAprovadores } = await import("../autoridade");

const SOLICITANTE = "11111111-1111-1111-1111-111111111111";
const OUTRO_APROVADOR = "22222222-2222-2222-2222-222222222222";

function setConfig(uuidsCsv: string) {
  (globalThis as { __configFreteAvulso?: string }).__configFreteAvulso = uuidsCsv;
}

function setConfigLoja(uuidsCsv: string) {
  (globalThis as { __configFreteAvulsoLoja?: string }).__configFreteAvulsoLoja = uuidsCsv;
}

beforeEach(() => {
  sqlMock.mockClear();
  usuariosAtivos.clear();
  usuariosAtivos.add(SOLICITANTE);
  usuariosAtivos.add(OUTRO_APROVADOR);
  setConfig("");
  setConfigLoja("");
});

describe("podeDecidir('frete_avulso', ctx.solicitanteId) — sem auto-aprovação", () => {
  it("pool = [solicitante] (só ele configurado) → solicitante NÃO pode decidir, motivo claro (não genérico)", async () => {
    setConfig(SOLICITANTE);
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(false);
    expect(resultado.motivo).toBe("aprovador_e_o_proprio_solicitante");
  });

  it("pool = [solicitante, outroAprovador] → solicitante NÃO decide, outroAprovador decide normalmente", async () => {
    setConfig(`${SOLICITANTE},${OUTRO_APROVADOR}`);

    const decisaoSolicitante = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso",
      { solicitanteId: SOLICITANTE },
    );
    expect(decisaoSolicitante.pode).toBe(false);
    // Ainda há gente no pool (outroAprovador) — não é o caso "só sobrou o
    // solicitante", então o motivo volta a ser o genérico de "não é aprovador".
    expect(decisaoSolicitante.motivo).toBe("nao_e_aprovador_configurado");

    const decisaoOutro = await podeDecidir(
      { id: OUTRO_APROVADOR, role: "gerente_loja" },
      "frete_avulso",
      { solicitanteId: SOLICITANTE },
    );
    expect(decisaoOutro.pode).toBe(true);
  });

  it("config totalmente vazia (nunca configuraram) → motivo genérico 'aprovador_nao_configurado', NÃO o de auto-aprovação", async () => {
    setConfig("");
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(false);
    expect(resultado.motivo).toBe("aprovador_nao_configurado");
  });

  it("resolverAprovadores expõe apenasSolicitante:true só quando a exclusão esvaziou uma config que TINHA gente", async () => {
    setConfig(SOLICITANTE);
    const r1 = await resolverAprovadores("frete_avulso", { solicitanteId: SOLICITANTE });
    expect(r1.status).toBe("nao_configurado");
    expect(r1.status === "nao_configurado" && r1.apenasSolicitante).toBe(true);

    setConfig("");
    const r2 = await resolverAprovadores("frete_avulso", { solicitanteId: SOLICITANTE });
    expect(r2.status).toBe("nao_configurado");
    expect(r2.status === "nao_configurado" && r2.apenasSolicitante).toBeFalsy();
  });

  it("SEM ctx.solicitanteId (comportamento antigo do bug): o solicitante configurado sozinho DECIDIRIA — prova que o ctx é o que corrige", async () => {
    setConfig(SOLICITANTE);
    const resultado = await podeDecidir({ id: SOLICITANTE, role: "gerente_loja" }, "frete_avulso");
    expect(resultado.pode).toBe(true);
  });
});

describe("podeDecidir('frete_avulso_loja') — auto-aprovação PERMITIDA (31/07, decisão do Jonathan)", () => {
  it("pool = [solicitante]: quem está em aprovadores_frete_avulso_loja aprova o PRÓPRIO frete pago pela loja, mesmo com ctx.solicitanteId", async () => {
    setConfigLoja(SOLICITANTE);
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso_loja",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(true);
  });

  it("quem NÃO está no pool da loja continua barrado (a flag não abre pra qualquer um)", async () => {
    setConfigLoja(OUTRO_APROVADOR);
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso_loja",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(false);
    expect(resultado.motivo).toBe("nao_e_aprovador_configurado");
  });

  it("config da loja vazia → 'aprovador_nao_configurado' (a flag não inventa aprovador)", async () => {
    setConfigLoja("");
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso_loja",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(false);
    expect(resultado.motivo).toBe("aprovador_nao_configurado");
  });

  it("ANTI-VOLTA: o irmão 'frete_avulso' (cliente) SEGUE excluindo o solicitante — a flag é só da loja", async () => {
    setConfig(SOLICITANTE);
    setConfigLoja(SOLICITANTE);
    const resultado = await podeDecidir(
      { id: SOLICITANTE, role: "gerente_loja" },
      "frete_avulso",
      { solicitanteId: SOLICITANTE },
    );
    expect(resultado.pode).toBe(false);
    expect(resultado.motivo).toBe("aprovador_e_o_proprio_solicitante");
  });
});
