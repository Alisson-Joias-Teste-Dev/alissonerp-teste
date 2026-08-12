import { test, expect } from "@playwright/test";
import { loginComoAdminTeste, loginComoVendedoraTeste, loginComoGerenteFabrica } from "./helpers";

test("login funciona — admin de teste", async ({ page }) => {
  await loginComoAdminTeste(page);
  await expect(page).not.toHaveURL(/login/);
});

test("login funciona — vendedora de teste", async ({ page }) => {
  await loginComoVendedoraTeste(page);
  await expect(page).not.toHaveURL(/login/);
});

test("login funciona — gerente de fábrica", async ({ page }) => {
  await loginComoGerenteFabrica(page);
  await expect(page).not.toHaveURL(/login/);
});
