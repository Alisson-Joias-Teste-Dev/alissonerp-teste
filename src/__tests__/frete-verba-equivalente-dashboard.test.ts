/**
 * Teste ANTI-VOLTA — BLOCO 3 (verba de frete grátis, cálculo do faturamento).
 *
 * O bug que este arquivo prova que não acontece: `calcularFaturamentoMes`
 * (src/lib/frete-verba.ts) e a consulta de faturamento da dashboard
 * comercial (src/app/api/dashboard-comercial/vendas-dashboard/route.ts,
 * campo `visaoGeral.alcancado_bruto`) DIVERGIREM — por exemplo alguém mudar
 * a condição de status cancelado, a view usada, ou a coluna de data em só um
 * dos dois lugares, e a verba passar a ser calculada sobre um faturamento
 * diferente do que a loja vê na tela do dashboard (o Jonathan conferiu
 * manualmente que os dois precisam bater — homolog, jul/26: 17 vendas,
 * R$ 217.867,00).
 *
 * ESTRATÉGIA (por que não roda as duas consultas contra um banco real):
 * o setup de teste deste projeto usa vitest com environment:"node" e SEM
 * banco disponível (todas as libs de acesso a dados são mockadas nos outros
 * testes — ver frete-avulso-invariantes-lib.test.ts). Não dá para comparar
 * o RESULADO das duas consultas rodando de verdade dentro deste teste.
 *
 * Em vez disso, este teste lê o TEXTO-FONTE dos dois arquivos e extrai o
 * filtro WHERE de cada consulta (view + condição de data + condição de
 * status), normaliza (remove aliases de tabela como "v.") e afirma que os
 * dois filtros são IDÊNTICOS. Se alguém alterar o filtro em um arquivo sem
 * espelhar no outro — trocar `!= 4` por outro valor, remover o `IS NOT
 * NULL`, trocar a view, etc. — a extração por regex vai capturar textos
 * diferentes e o teste quebra, apontando exatamente qual lado mudou.
 *
 * Isso não é uma prova de equivalência RUNTIME (não pega, por exemplo, um
 * bug em como os parâmetros são interpolados), mas é a garantia possível
 * neste setup de teste: os dois arquivos usam A MESMA string de filtro.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CAMINHO_FRETE_VERBA = join(process.cwd(), "src/lib/frete-verba.ts");
const CAMINHO_DASHBOARD = join(
  process.cwd(),
  "src/app/api/dashboard-comercial/vendas-dashboard/route.ts",
);

/**
 * Remove aliases de tabela ("v.", "vd.", etc.), troca os nomes de variável
 * interpolados (`${inicio}`/`${from}` etc. — são só nomes de parâmetro JS,
 * não fazem parte do FILTRO em si) por um token fixo, e normaliza espaços
 * em branco.
 */
function normalizar(sqlTrecho: string): string {
  return sqlTrecho
    .replace(/\b\w+\./g, "") // tira "v.status" -> "status"
    .replace(/\$\{[^}]+\}/g, "${PARAM}") // tira "${inicio}"/"${from}" -> token fixo
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai o filtro `WHERE <alias.>data_venda BETWEEN ... AND <alias.>status
 * IS NOT NULL AND <alias.>status != 4` do texto-fonte de um arquivo.
 * Lança se não encontrar — o teste deve FALHAR de forma clara (não passar
 * silenciosamente) se o padrão não existir mais em algum dos dois lados.
 */
function extrairFiltro(caminho: string): string {
  const fonte = readFileSync(caminho, "utf-8");
  const regex =
    /(?:\w+\.)?data_venda\s+BETWEEN\s+\$\{[^}]+\}::date\s+AND\s+\$\{[^}]+\}::date\s+AND\s+(?:\w+\.)?status\s+IS\s+NOT\s+NULL\s+AND\s+(?:\w+\.)?status\s*!=\s*4/i;
  const match = fonte.match(regex);
  if (!match) {
    throw new Error(
      `Filtro de faturamento não encontrado em ${caminho} — o padrão esperado ` +
        `(data_venda BETWEEN ... AND status IS NOT NULL AND status != 4) mudou ` +
        `de forma incompatível com este teste. Atualize a regex OU o código.`,
    );
  }
  return normalizar(match[0]);
}

describe("calcularFaturamentoMes usa o MESMO filtro da dashboard comercial", () => {
  it("view usada é a mesma (vw_dash_vendas_todas) nos dois arquivos", () => {
    const freteVerba = readFileSync(CAMINHO_FRETE_VERBA, "utf-8");
    const dashboard = readFileSync(CAMINHO_DASHBOARD, "utf-8");
    expect(freteVerba).toContain("alissonerp.vw_dash_vendas_todas");
    expect(dashboard).toContain("alissonerp.vw_dash_vendas_todas");
  });

  it("coluna somada é a mesma (total_venda) nos dois arquivos", () => {
    const freteVerba = readFileSync(CAMINHO_FRETE_VERBA, "utf-8");
    const dashboard = readFileSync(CAMINHO_DASHBOARD, "utf-8");
    expect(freteVerba).toContain("total_venda");
    expect(dashboard).toContain("total_venda");
  });

  it("o filtro WHERE (data_venda no período + status válido) é IDÊNTICO nos dois arquivos", () => {
    const filtroFreteVerba = extrairFiltro(CAMINHO_FRETE_VERBA);
    const filtroDashboard = extrairFiltro(CAMINHO_DASHBOARD);

    expect(filtroFreteVerba).toBe(filtroDashboard);
  });
});

/**
 * 🔴 LÍQUIDO (03/08/2026) — decisão do Jonathan: *"o saldo que é gerado ele é
 * do faturamento líquido e não do bruto"*.
 *
 * "Líquido" tem UMA definição neste projeto: a da dashboard comercial
 * (`totalLiquido = totalBruto - valorVale`). Este bloco garante que a verba
 * usa a MESMA subtração — se alguém remover o desconto de vale-troca aqui, ou
 * inventar um "líquido" diferente (descontando devolução, desconto, frete...),
 * a verba para de bater com o número que ele olha na tela.
 *
 * NÚMEROS REAIS (prod, julho/2026): bruto R$ 751.010,92 − vale-troca
 * R$ 19.306,00 = líquido R$ 731.704,92 → verba R$ 731,70 (era R$ 751,01).
 */
describe("a verba usa o faturamento LÍQUIDO, com a mesma subtração da dashboard", () => {
  it("frete-verba desconta valor_vale_troca da soma de total_venda", () => {
    const fonte = readFileSync(CAMINHO_FRETE_VERBA, "utf-8");
    const somaLiquida = fonte.match(
      /SUM\(total_venda\)\s*-\s*SUM\(COALESCE\(valor_vale_troca,\s*0\)\)/i,
    );
    expect(
      somaLiquida,
      "calcularFaturamentoLiquidoMes deve somar total_venda e SUBTRAIR valor_vale_troca — " +
        "é a mesma conta do alcancado_periodo da dashboard.",
    ).not.toBeNull();
  });

  it("a dashboard usa a MESMA coluna de vale-troca (valor_vale_troca) para o líquido", () => {
    const dashboard = readFileSync(CAMINHO_DASHBOARD, "utf-8");
    expect(dashboard).toContain("valor_vale_troca");
    // A conta de lá é em JS, não em SQL — o que precisa casar é a COLUNA e o
    // sentido da operação (subtrair do bruto).
    expect(dashboard).toMatch(/totalLiquido\s*=\s*totalBruto\s*-\s*valorVale/);
  });

  it("a função da verba chama a versão LÍQUIDA, não a bruta", () => {
    const fonte = readFileSync(CAMINHO_FRETE_VERBA, "utf-8");
    const corpo = fonte.slice(fonte.indexOf("export async function calcularVerbaFreteGratis"));
    expect(corpo).toContain("calcularFaturamentoLiquidoMes(inicio, fim)");
  });

  /**
   * 🔴 A BASE É O MÊS ANTERIOR À COMPETÊNCIA — *"a verba do mês de julho é o
   * faturamento do mês de junho"* (Jonathan, 03/08).
   *
   * POR QUE ESTE TESTE EXISTE: em 03/08 eu quebrei exatamente isto. Ao mudar o
   * RÓTULO do fechamento para a competência, troquei a BASE junto, e a verba
   * passou a sair do próprio mês fechado. Passou em tudo — nenhum teste
   * olhava a base — e só apareceu porque o Jonathan reconheceu o número errado
   * na tela. Este teste é a rede que faltava.
   *
   * Prova independente: no relatório consolidado de julho que ele fechou à mão
   * em 31/07, a verba era R$ 777,86 = 0,1% do líquido de JUNHO (R$ 777.860,82).
   * O líquido de julho daria R$ 731,70.
   */
  it("a base é o mês ANTERIOR ao de competência (competência julho ⇒ soma junho)", () => {
    const fonte = readFileSync(CAMINHO_FRETE_VERBA, "utf-8");
    const corpo = fonte.slice(fonte.indexOf("export async function calcularVerbaFreteGratis"));

    // Início = dia 1 do mês anterior; fim = dia 0 do mês de competência
    // (= último dia do mês anterior).
    expect(corpo).toMatch(/getMonth\(\)\s*-\s*1,\s*1\s*\)/);
    expect(corpo).toMatch(/new Date\(\s*mesCompetencia\.getFullYear\(\),\s*mesCompetencia\.getMonth\(\),\s*0\s*\)/);
    // Não pode voltar a somar o próprio mês de competência.
    expect(corpo).not.toMatch(/new Date\(\s*mesCompetencia\.getFullYear\(\),\s*mesCompetencia\.getMonth\(\),\s*1\s*\)/);
  });
});
