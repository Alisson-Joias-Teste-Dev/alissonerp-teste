import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Diretórios de frameworks/ferramentas externas (não são código do projeto)
    ".aiox-core/**",
    ".aiox/**",
    ".claude/**",
    ".codex/**",
    ".cursor/**",
    ".gemini/**",
    ".antigravity/**",
    ".github/**",
    "node_modules/**",
    // Scripts de manutenção e utilitários raiz (não são código da aplicação)
    "scripts/**",
    "gerar_relatorio.js",
  ]),
]);

export default eslintConfig;
