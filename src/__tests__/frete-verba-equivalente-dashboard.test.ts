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
