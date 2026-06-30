#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
  SwissJS Bundle Size Reporter
  Measures the gzipped and raw sizes of each package's dist/ entrypoints.
  Compares against stored baselines in docs/reports/bundle-baselines.json.

  Usage:
    node scripts/bundle-report.mjs            # report only
    node scripts/bundle-report.mjs --update   # update baselines
    node scripts/bundle-report.mjs --check    # fail if any package exceeds budget
    node scripts/bundle-report.mjs --output docs/reports/bundle-report.md
*/

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const repoRoot = process.cwd();
const BASELINES_PATH = join(repoRoot, 'docs/reports/bundle-baselines.json');

// Packages to measure — each object maps to a dist entrypoint file.
// Sizes are measured on the built output, so this requires `pnpm build` first.
const PACKAGES = [
  { name: '@swissjs/core',     distFile: 'runtime/dist/index.js' },
  { name: '@swissjs/compiler', distFile: 'compiler/dist/index.js' },
  { name: '@swissjs/shared',   distFile: 'shared/dist/index.js' },
  { name: '@swissjs/router',   distFile: 'router/dist/index.js' },
  { name: '@swissjs/security', distFile: 'security/dist/index.js' },
];

// Budget: a package whose gzipped size exceeds its baseline by more than this
// percentage will cause --check to fail.
const BUDGET_TOLERANCE_PCT = 5; // 5% regression budget

function measure(filePath) {
  const abs = join(repoRoot, filePath);
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs);
  const gz = gzipSync(raw);
  return { rawBytes: raw.length, gzBytes: gz.length };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function ensureDir(p) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const args = process.argv.slice(2);
const shouldUpdate = args.includes('--update');
const shouldCheck = args.includes('--check');
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

let baselines = {};
if (existsSync(BASELINES_PATH)) {
  try { baselines = JSON.parse(readFileSync(BASELINES_PATH, 'utf8')); } catch { /* start fresh */ }
}

const results = [];
let hasViolation = false;

for (const pkg of PACKAGES) {
  const m = measure(pkg.distFile);
  if (!m) {
    results.push({ ...pkg, status: 'MISSING', note: `${pkg.distFile} not found — run pnpm build first` });
    continue;
  }
  const baseline = baselines[pkg.name];
  let status = 'OK';
  let note = '';
  if (baseline && !shouldUpdate) {
    const pctChange = ((m.gzBytes - baseline.gzBytes) / baseline.gzBytes) * 100;
    if (pctChange > BUDGET_TOLERANCE_PCT) {
      status = 'OVER BUDGET';
      note = `+${pctChange.toFixed(1)}% gz vs baseline (budget: +${BUDGET_TOLERANCE_PCT}%)`;
      if (shouldCheck) hasViolation = true;
    } else if (pctChange < -1) {
      status = 'REDUCED';
      note = `${pctChange.toFixed(1)}% gz vs baseline`;
    } else {
      note = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% gz vs baseline`;
    }
  } else if (!baseline) {
    note = 'no baseline yet';
  }
  results.push({ ...pkg, ...m, status, note });
}

// Print report
const lines = [];
lines.push('# Bundle Size Report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('| Package | Raw | Gzipped | Status | Note |');
lines.push('|---------|-----|---------|--------|------|');
for (const r of results) {
  const raw = r.rawBytes != null ? fmtBytes(r.rawBytes) : '—';
  const gz  = r.gzBytes  != null ? fmtBytes(r.gzBytes)  : '—';
  lines.push(`| ${r.name} | ${raw} | ${gz} | ${r.status} | ${r.note} |`);
}
lines.push('');
if (shouldUpdate) {
  const updated = {};
  for (const r of results) {
    if (r.rawBytes != null) updated[r.name] = { rawBytes: r.rawBytes, gzBytes: r.gzBytes };
  }
  ensureDir(BASELINES_PATH);
  writeFileSync(BASELINES_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), ...updated }, null, 2));
  lines.push('Baselines updated.');
}

const report = lines.join('\n');
console.log(report);

if (outputPath) {
  ensureDir(outputPath);
  writeFileSync(outputPath, report);
  console.log(`\nReport written to ${outputPath}`);
}

if (shouldCheck && hasViolation) {
  console.error('\nBundle size budget exceeded. Run with --update to accept the new sizes.');
  process.exit(1);
}
