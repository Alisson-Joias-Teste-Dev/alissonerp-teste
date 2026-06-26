import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  // Rebaixa regras legacy de error → warn para não bloquear o hook durante limpeza gradual
  {
    rules: {
      "@typescript-eslint/no-explicit-any":   "warn",
      "react-hooks/set-state-in-effect":       "warn",
      "react-hooks/static-components":         "warn",
    },
  },
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
    // Scripts de manutenção, prototipos e utilitarios raiz (nao sao codigo da aplicacao)
    "scripts/**",
    "gerar_relatorio.js",
    "admin-page-tabs.jsx",
    "admin-showcase-tab.jsx",
    "catalog-overrides.js",
    "catalog.jsx",
    "category-gallery.jsx",
    "erp-api.js",
    "page-settings.js",
    "tweaks-panel.jsx",
  ]),
]);

export default eslintConfig;
