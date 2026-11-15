import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Fronteira do módulo CRM: ele só usa a base comum do app (ui, contexto de auth,
  // cliente Supabase, utilitários). Nada de páginas/componentes de outros módulos.
  {
    files: ["src/modules/crm/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/pages/*", "@/pages"], message: "O CRM é independente: não importe páginas do app." },
          { group: ["@/components/*", "!@/components/ui", "!@/components/ui/*"], message: "No CRM use só @/components/ui." },
          { group: ["@/hooks/features/*", "@/utils/*"], message: "O CRM é independente: traga a lógica para src/modules/crm." },
        ],
      }],
    },
  },
  // ...e o resto do app não importa o CRM diretamente (só App.tsx, via lazy)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/modules/crm/**", "src/App.tsx", "src/__tests__/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/modules/crm", "@/modules/crm/*", "**/modules/crm/**"], message: "Use o CRM só pela rota /crm (lazy em App.tsx)." }],
      }],
    },
  },
);
