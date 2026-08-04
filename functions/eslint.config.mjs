import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import { defineConfig } from "eslint/config";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const google = require("eslint-config-google");

export default defineConfig([
  {
    ignores: ["lib/**/*", "generated/**/*", "*.js"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    rules: google.rules,
  },
  {
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.dev.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "quotes": ["error", "double"],
      "import-x/no-unresolved": 0,
      "import-x/no-named-as-default": 0,
      "import-x/no-named-as-default-member": 0,
      "@typescript-eslint/no-explicit-any": "error",
      "indent": ["error", 2],
      "object-curly-spacing": "off",
      "max-len": "off",
      "valid-jsdoc": "off",
      "require-jsdoc": "off",
    },
  },
]);
