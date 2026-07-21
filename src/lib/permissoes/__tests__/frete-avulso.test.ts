/**
 * Teste de MATRIZ papel × capacidade — src/lib/permissoes/frete-avulso.ts
 * (BLOCO 3, 21/07). No espírito de
 * src/lib/aprovacoes/__tests__/matriz-sql-ts-aprovadores.test.ts: congela,
 * pra CADA papel real do banco (SELECT DISTINCT role FROM alissonerp.usuarios,
 * homolog, 21/07 — 15 papéis), o que ele PODE solicitar / criar direto.
 *
 * POR QUE TABLE-DRIVEN: se alguém adicionar um papel novo em só um lado (front
 * OU backend) sem passar por este módulo, este teste não pega isso
 * diretamente — o que ele garante é que o COMPORTAMENTO do módulo (a única
 * fonte que front e backend importam) está correto e documentado papel a
 * papel. A segunda describe (mais abaixo) cobre a OUTRA metade do bug de
 * origem: garante que os arquivos consumidores (route.ts,
 * VendaDetalheClient.tsx, EntregasVendaClient.tsx) IMPORTAM deste módulo em
 * vez de manter lista própria — se alguém reintroduzir uma lista inline,
 * aquele teste quebra.
 *
 * IMPACTO SE REMOVIDO: um papel pode ganhar/perder acesso silenciosamente
 * numa mudança futura no módulo, sem nenhum teste travando o comportamento
 * documentado (ex.: diretor virar "cria direto" por engano).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  podeSolicitarFreteAvulso,
  podeCriarFreteAvulsoDireto,
  podeAcessarFreteAvulso,
} from "../frete-avulso";

describe("Matriz papel × capacidade — frete avulso", () => {
  interface Caso {
    role: string;
    solicita: boolean;
    criaDireto: boolean;
    obs?: string;
  }

  // Matriz = os 15 papéis REAIS confirmados em homolog
  // (SELECT DISTINCT role FROM alissonerp.usuarios ORDER BY 1; 21/07/2026).
  const matriz: Caso[] = [
    { role: "admin", solicita: true, criaDireto: true, obs: "full access" },
    { role: "desenvolvedor", solicita: true, criaDireto: true, obs: "full access" },
    { role: "diretor", solicita: true, criaDireto: false, obs: "decisão Jonathan: só solicita, não libera custo sozinho" },
    { role: "gerente_loja", solicita: true, criaDireto: true },
    { role: "consultora", solicita: true, criaDireto: true, obs: "já liberada antes do BLOCO 3" },
    { role: "estoquista_loja", solicita: true, criaDireto: true, obs: "papel REAL confirmado no banco (não existe role 'estoquista' genérico)" },
    { role: "estoquista_fabrica", solicita: false, criaDireto: false, obs: "frete avulso é despacho da LOJA — fábrica não participa" },
    { role: "gerente_fabrica", solicita: false, criaDireto: false },
    { role: "administrativo", solicita: false, criaDireto: false },
    { role: "financeiro", solicita: false, criaDireto: false },
    { role: "operador_inventario", solicita: false, criaDireto: false },
    { role: "ourives", solicita: false, criaDireto: false },
    { role: "pcp", solicita: false, criaDireto: false },
    { role: "motoboy", solicita: false, criaDireto: false, obs: "papel distinto de 'entregador' (auto-registro tem rota própria em route.ts)" },
    { role: "entregador", solicita: false, criaDireto: false, obs: "auto-registro bypassa estas listas via ramo próprio (ehEntregador) em route.ts — não passa por aqui" },
  ];

  it.each(matriz)("$role → solicita=$solicita, criaDireto=$criaDireto ($obs)", ({ role, solicita, criaDireto }) => {
    expect(podeSolicitarFreteAvulso(role)).toBe(solicita);
    expect(podeCriarFreteAvulsoDireto(role)).toBe(criaDireto);
    // União: acessa o endpoint se pode qualquer um dos dois modos.
    expect(podeAcessarFreteAvulso(role)).toBe(solicita || criaDireto);
  });

  it("papel desconhecido/null/undefined → nenhuma capacidade (nunca abre exceção pra role ausente)", () => {
    expect(podeSolicitarFreteAvulso(null)).toBe(false);
    expect(podeSolicitarFreteAvulso(undefined)).toBe(false);
    expect(podeSolicitarFreteAvulso("papel-que-nao-existe")).toBe(false);
    expect(podeCriarFreteAvulsoDireto(null)).toBe(false);
    expect(podeAcessarFreteAvulso(null)).toBe(false);
  });

  it("todo papel que cria DIRETO também pode solicitar (criar direto é o caminho MAIS liberado, não um modo à parte)", () => {
    for (const { role, criaDireto } of matriz) {
      if (criaDireto) expect(podeSolicitarFreteAvulso(role)).toBe(true);
    }
  });
});

describe("Consumidores IMPORTAM a fonte única (não reescrevem a lista)", () => {
  const root = path.resolve(__dirname, "..", "..", "..", "..");

  function lerArquivo(relPath: string): string {
    return readFileSync(path.join(root, relPath), "utf-8");
  }

  it("route.ts (backend) importa podeAcessarFreteAvulso/podeSolicitarFreteAvulso/podeCriarFreteAvulsoDireto de src/lib/permissoes/frete-avulso", () => {
    const src = lerArquivo("src/app/api/entregas-venda/frete-avulso/route.ts");
    expect(src).toMatch(/from ["']@\/lib\/permissoes\/frete-avulso["']/);
    expect(src).toMatch(/podeAcessarFreteAvulso/);
    expect(src).toMatch(/podeSolicitarFreteAvulso/);
    expect(src).toMatch(/podeCriarFreteAvulsoDireto/);
    // Não deve existir mais uma lista local tipo ROLES_LOJA = [...]
    expect(src).not.toMatch(/const ROLES_LOJA\s*=/);
  });

  it("VendaDetalheClient.tsx (front — botão 'Solicitar frete avulso') importa podeSolicitarFreteAvulso do módulo único", () => {
    const src = lerArquivo("src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx");
    expect(src).toMatch(/from ["']@\/lib\/permissoes\/frete-avulso["']/);
    expect(src).toMatch(/podeSolicitarFreteAvulso/);
  });

  it("EntregasVendaClient.tsx (front — botão 'Frete Avulso' direto) importa podeCriarFreteAvulsoDireto do módulo único", () => {
    const src = lerArquivo("src/app/(dashboard)/entregas-venda/EntregasVendaClient.tsx");
    expect(src).toMatch(/from ["']@\/lib\/permissoes\/frete-avulso["']/);
    expect(src).toMatch(/podeCriarFreteAvulsoDireto/);
  });
});
