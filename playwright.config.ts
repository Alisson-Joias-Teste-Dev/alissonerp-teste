import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // telas compartilham o mesmo login e o mesmo banco de teste
  workers: 1,
  timeout: 20000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3010",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
});
