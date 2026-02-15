#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const apiDir = resolve(repoRoot, 'docs', 'api');

mkdirSync(apiDir, { recursive: true });

// Discover generated package API subdirs and build links
let links = [];
try {
  const entries = readdirSync(apiDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // Ignore hidden dirs or vitepress cache dirs if any
    if (e.name.startsWith('.')) continue;
    const indexPath = resolve(apiDir, e.name, 'index.md');
    const readmePath = resolve(apiDir, e.name, 'README.md');
    if (existsSync(indexPath) || existsSync(readmePath)) {
      links.push(`- [${e.name}](/api/${e.name}/)`);
    }
  }
} catch (err) {
  // Non-fatal: if apiDir unreadable during early stages, continue with empty list
  console.warn('[DocsRunner] Warning: unable to read docs/api directory:', err?.message ?? String(err));
}

links.sort((a, b) => a.localeCompare(b));

const content = `---\ntitle: SwissJS API\n---\n\n# SwissJS API Reference\n\nSelect a package to view its API:\n\n${links.join('\n') || '- (no packages found)'}\n\nNotes:\n- These pages are generated during \`pnpm reset\`.\n- API output paths are stable and package-name-based to avoid 404s.\n`;

writeFileSync(resolve(apiDir, 'index.md'), content, 'utf8');
console.log('[DocsRunner] Ensured docs/api/index.md exists');
