/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { cleanup } from "./render.js";

/**
 * Registers an automatic `afterEach(cleanup)` with the ambient test runner
 * (vitest/jest-shaped globals: `afterEach`). Import this once, e.g. from a
 * vitest setupFiles entry:
 *
 *   // vitest.config.ts
 *   test: { setupFiles: ['@swissjs/testing/setup'] }
 *
 * or call it explicitly at the top of a test file.
 */
export function setupAutoCleanup(): void {
  const g = globalThis as { afterEach?: (fn: () => void) => void };
  if (typeof g.afterEach === "function") {
    g.afterEach(cleanup);
  }
}

setupAutoCleanup();
