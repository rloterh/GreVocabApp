import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist", "src-tauri/target", "src-tauri/gen"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // no-undef is unreliable on TypeScript: it can't see the React UMD
      // global or lib.dom types like FileSystemDirectoryHandle, so it reports
      // false positives on valid code. tsc already rejects undefined names,
      // and `npm run typecheck` runs in CI. This is the upstream
      // typescript-eslint recommendation.
      "no-undef": "off",
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // cva variant tables live beside the component they style.
          allowExportNames: ["badgeVariants", "buttonVariants"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Build config runs in Node, not the browser.
    files: ["vite.config.ts", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
