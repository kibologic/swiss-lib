/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// ESLint flat config for SAST runs (security-centric). Narrow and strict.
// Converted from the legacy .eslintrc.sast.cjs format, which ESLint 9's flat
// config system rejects outright (the eslintrc "env" key has no flat-config
// equivalent it will silently accept).
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig } from "eslint/config";

// eslint-plugin-sonarjs@2.0.4 bundles its own internal
// @typescript-eslint/eslint-plugin@7.16.1 to wrap/sanitize TS-ESLint rules
// (no-empty-function, no-unused-expressions, etc.) for cross-compat. That
// sanitizer crashes ("Cannot read properties of undefined") against this
// repo's real @typescript-eslint/eslint-plugin@8.x -- not one bad rule, the
// whole TS-wrapping layer inside sonarjs.configs.recommended. Rather than
// pull in the full recommended set and disable every rule that touches it,
// enable only the specific plain-JS sonarjs rule this config has always
// actually cared about (see the rules block below).
export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "docs/api/**",
      "docs/.vitepress/dist/**",
    ],
  },
  security.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { sonarjs },
    languageOptions: {
      parserOptions: { project: false, sourceType: "module" },
    },
    rules: {
      // Turn potentially risky patterns into hard errors
      "security/detect-unsafe-regex": "error",
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-child-process": "error",

      // Sonar suggestions
      "sonarjs/no-all-duplicated-branches": "warn",

      // TS strictness for SAST
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "error",
    },
  },
]);
