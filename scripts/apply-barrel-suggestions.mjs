#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'barrel-suggest.json');
if (!fs.existsSync(reportPath)) {
  console.error('[apply-barrel-suggestions] Missing report:', reportPath);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const entries = report.suggest || [];
// Allowlist prefixes for safe auto-apply (avoid core/compiler/cli)
const ALLOW_PREFIXES = [
  'packages/devtools/',
  'packages/plugins/',
  'packages/security',
  'packages/utils',
];

// Filters: do not export test files or .d.js type definitions
const excludePatterns = [/\/__tests__\//, /\.d\.js$/];

function shouldInclude(line) {
  return !excludePatterns.some((rx) => rx.test(line));
}

let updated = 0;
for (const e of entries) {
  const barrelRel = e.barrel;
  if (!barrelRel || !barrelRel.endsWith('src/index.ts')) continue; // only TS barrels
  // Enforce allowlist of package paths
  if (!ALLOW_PREFIXES.some((p) => barrelRel.startsWith(p))) continue;

  const barrelAbs = path.join(root, barrelRel);
  // Ensure package exists and file exists or can be created
  const dir = path.dirname(barrelAbs);
  fs.mkdirSync(dir, { recursive: true });

  const suggestions = (e.suggestions || []).filter(shouldInclude);
  // Skip if no suggestions
  if (!suggestions.length) continue;

  // Preserve any existing first-line shebangs or headers, but generally we overwrite with exports only.
  let header = '';
  if (fs.existsSync(barrelAbs)) {
    const existing = fs.readFileSync(barrelAbs, 'utf8');
    const shebang = existing.startsWith('#!') ? existing.split('\n')[0] + '\n' : '';
    header = shebang;
  }

  const content = `${header}// Auto-applied barrel exports (generated from docs/reports/barrel-suggest.json)\n${suggestions.join('\n')}\n`;
  fs.writeFileSync(barrelAbs, content, 'utf8');
  console.log('[apply] updated', barrelRel);
  updated++;
}

console.log(`[apply-barrel-suggestions] Updated ${updated} barrels.`);
