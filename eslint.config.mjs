/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import baseConfig from "../../config/eslint.base.mjs";
import tseslint from "typescript-eslint";
import vitest from "eslint-plugin-vitest";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...baseConfig,
  // TypeScript parser + plugin registration for all .ts/.tsx/.ui/.uix files.
  // Plugin is registered so inline `// eslint-disable ... @typescript-eslint/*`
  // comments resolve correctly. No rules are enabled here — each package adds
  // its own rules. Using tseslint.config() with disableTypeChecked to avoid
  // pulling in any rule changes.
  {
    files: ["**/*.{ts,tsx,ui,uix}"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    plugins: { vitest },
    languageOptions: { globals: vitest.environments.env.globals },
  },
  {
    files: ["packages/**/src/**/*.{ts,tsx,js,ui,uix}"],
    rules: {
      // Forbid deep imports into @swissjs/* internal src trees
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@swissjs/*/src/**"],
              message:
                "Deep imports into @swissjs/*/src/** are forbidden; use the package barrel @swissjs/<pkg>.",
            },
          ],
        },
      ],
    },
  },
]);
