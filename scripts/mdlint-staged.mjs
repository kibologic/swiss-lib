#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/*
 Filters staged markdown files to exclude generated and legacy docs.
 Usage: node scripts/mdlint-staged.mjs <files>
*/
import { spawnSync } from 'node:child_process'

const proc = /** @type {any} */ (globalThis).process
const args = (proc?.argv ?? []).slice(2)
const filtered = args.filter((p) => {
  const s = String(p)
  const isGenerated =
    s.startsWith('docs/api/') ||
    s.includes('/docs/api/') ||
    s.startsWith('docs/.vitepress/dist/') ||
    s.includes('/docs/.vitepress/dist/')
  const isDepsOrBuild = s.includes('/node_modules/') || s.includes('/dist/')
  return !(isGenerated || isDepsOrBuild)
})

if (filtered.length === 0) proc?.exit(0)

const result = spawnSync('npx', ['--yes', 'markdownlint-cli2', ...filtered], {
  stdio: 'inherit',
  shell: false
})
proc?.exit(result.status ?? 1)
