import { test, expect } from "@playwright/test";
import { loginComoAdminTeste } from "./helpers";

/**
 * Teste de fumaça — entra em cada tela principal do sistema e confirma que
 * carrega sem tela em branco, sem erro de JavaScript e sem "Application error".
 * Não clica em botões de dentro da tela (isso fica pra spec dedicado de cada
 * módulo) — o objetivo aqui é pegar rápido qualquer tela que quebrou de vez.
 */

const PAGINAS: { area: string; rotas: string[] }[] = [
  { area: "Dashboard", rotas: ["/"] },
  {
    area: "Produção",
    rotas: ["/dashboard-fabrica", "/ordens", "/pcp", "/rotas-padrao", "/setores"],
  },
  { area: "Distribuição/Fábrica", rotas: ["/distribuicao", "/purificacao", "/service-painel"] },
  {
    area: "Suprimentos",
    rotas: ["/estoque", "/quebra", "/insumos", "/compras", "/compras-comercial", "/metal"],
  },
  {
    area: "Qualidade/Logística",
    rotas: ["/protocolo", "/movimentacao-interna", "/conferencia", "/entregas-venda", "/auditoria"],
  },
  { area: "Gestão", rotas: ["/tarefas", "/gestao-estoque"] },
  {
    area: "Comercial",
    rotas: [
      "/dashboard-comercial",
      "/vendas",
      "/vendas/solicitacoes-alteracao",
      "/estoque-comercial",
      "/conversoes",
      "/devolucoes",
      "/vale-troca",
      "/produtos",
      "/comercial/promocoes",
      "/orcamento",
    ],
  },
  {
    area: "Finanças",
    rotas: [
      "/financeiro/a-pagar",
      "/financeiro/a-receber",
      "/financeiro/comissoes",
      "/financeiro/caixa",
      "/financeiro/conciliacao",
      "/crediario",
      "/precificacao",
    ],
  },
  { area: "E-Commerce/Criativo", rotas: ["/site", "/editor-ia", "/treinamentos"] },
];

test.describe("Fumaça — todas as telas carregam sem erro", () => {
  test.beforeEach(async ({ page }) => {
    await loginComoAdminTeste(page);
  });

  for (const { area, rotas } of PAGINAS) {
    for (const rota of rotas) {
      test(`${area} — ${rota} carrega sem erro`, async ({ page }) => {
        const errosConsole: string[] = [];
        page.on("pageerror", (err) => errosConsole.push(err.message));

        const resposta = await page.goto(rota);
        expect(resposta?.status(), `HTTP status de ${rota}`).toBeLessThan(500);

        await expect(page.getByText(/application error|erro inesperado/i)).toHaveCount(0);
        await page.waitForTimeout(500); // dá tempo de qualquer erro assíncrono aparecer

        expect(errosConsole, `Erros JS em ${rota}: ${errosConsole.join(" | ")}`).toHaveLength(0);
      });
    }
  }
});
