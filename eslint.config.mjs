/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import baseConfig from "../../config/eslint.base.mjs";
import vitest from "eslint-plugin-vitest";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...baseConfig,
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    plugins: { vitest },
    languageOptions: { globals: vitest.environments.env.globals },
  },
  {
    files: ["packages/**/src/**/*.{ts,tsx,js,ui,uix}"],
    rules: {
      // Forbid deep imports into @swissjs/* internal src trees
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ["@swissjs/*/src/**"],
              message: 'Deep imports into @swissjs/*/src/** are forbidden; use the package barrel @swissjs/<pkg>.'
            }
          ]
        }
      ],
    }
  },
]);
