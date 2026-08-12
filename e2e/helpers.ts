import type { Page } from "@playwright/test";
import { readFileSync } from "fs";

// Credenciais dos usuários SÓ-DE-TESTE (admin/vendedora), geradas por
// scripts/criar-usuarios-teste-e2e.mjs. Nunca commitadas — arquivo gitignored.
function lerCredenciaisTeste() {
  const raw = readFileSync(".env.e2e-credentials", "utf8");
  const map: Record<string, string> = {};
  for (const linha of raw.split("\n")) {
    const [chave, valor] = linha.split("=");
    if (chave && valor) map[chave.trim()] = valor.trim();
  }
  return map;
}

async function login(page: Page, email: string, senha: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', senha);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
}

// Loga como gerente_fabrica (usuário real, confirmado — Robson). Só enxerga
// Produção/Suprimentos/Qualidade/Protocolo, não Comercial/Finanças/Configurações.
export async function loginComoGerenteFabrica(page: Page) {
  await login(page, "gerente@alisson.com", "Gerente@123");
}

// Loga como o admin SÓ-DE-TESTE — vê tudo (29 módulos).
export async function loginComoAdminTeste(page: Page) {
  const c = lerCredenciaisTeste();
  await login(page, c.ADMIN_EMAIL, c.ADMIN_SENHA);
}

// Loga como a vendedora/consultora SÓ-DE-TESTE — só o que uma consultora vê
// (Comercial/Vendas), com vendedor_id real vinculado (id 4, Débora Eduarda,
// pra regras de comissão/desconto terem uma pessoa de verdade por trás).
export async function loginComoVendedoraTeste(page: Page) {
  const c = lerCredenciaisTeste();
  await login(page, c.CONSULTORA_EMAIL, c.CONSULTORA_SENHA);
}
