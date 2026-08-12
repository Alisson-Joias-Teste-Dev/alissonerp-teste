import { test, expect } from "@playwright/test";
import { loginComoVendedoraTeste, loginComoGerenteFabrica } from "./helpers";

/**
 * Testa a FRONTEIRA de permissão — não só "a tela abre", mas "quem não pode
 * ver, realmente não vê". Cada cargo tenta entrar direto pela URL numa área
 * que não é dele; o esperado é ser barrado (redirecionado ou aviso de acesso
 * negado), nunca ver o conteúdo de verdade.
 */

test.describe("Vendedora (consultora) não acessa áreas de outro cargo", () => {
  test.beforeEach(async ({ page }) => {
    await loginComoVendedoraTeste(page);
  });

  const AREAS_PROIBIDAS = [
    { nome: "Financeiro (A Pagar)", rota: "/financeiro/a-pagar" },
    { nome: "PCP (produção)", rota: "/pcp" },
    { nome: "Configurações de usuários", rota: "/configuracoes?tab=usuarios" },
    { nome: "Estoque de insumos (fábrica)", rota: "/insumos" },
  ];

  for (const { nome, rota } of AREAS_PROIBIDAS) {
    test(`vendedora tentando abrir ${nome} é barrada`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForTimeout(1000);

      // Não pode ficar de fato na rota proibida mostrando conteúdo real dela.
      const foiBarrada =
        !page.url().includes(rota.split("?")[0]) ||
        (await page.getByText(/sem permissão|acesso negado|não autorizado/i).count()) > 0;

      expect(foiBarrada, `Vendedora conseguiu ver ${nome} (${rota}) sem ser barrada`).toBeTruthy();
    });
  }

  test("vendedora consegue acessar a área dela (Vendas)", async ({ page }) => {
    const resposta = await page.goto("/vendas");
    expect(resposta?.status()).toBeLessThan(400);
    await expect(page.getByText(/sem permissão|acesso negado/i)).toHaveCount(0);
  });
});

test.describe("Gerente de fábrica não acessa Financeiro", () => {
  test.beforeEach(async ({ page }) => {
    await loginComoGerenteFabrica(page);
  });

  test("gerente de fábrica tentando abrir Financeiro é barrado", async ({ page }) => {
    await page.goto("/financeiro/a-pagar");
    await page.waitForTimeout(1000);
    const foiBarrado =
      !page.url().includes("/financeiro/a-pagar") ||
      (await page.getByText(/sem permissão|acesso negado|não autorizado/i).count()) > 0;
    expect(foiBarrado, "Gerente de fábrica conseguiu ver Financeiro sem ser barrado").toBeTruthy();
  });
});
