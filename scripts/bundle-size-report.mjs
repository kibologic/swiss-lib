#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Bundle size report (no external deps)
// - Walks packages folders looking for dist directories
// - Prints per-package size (KB) and total
// - Optional thresholds via env: SIZE_THRESHOLD_JSON='{"core":500,"cli":1500}'
//   where keys are package dir names (e.g., core, cli)
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

function listPackages(root) {
  const base = resolve(root, 'packages');
  const out = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const lvl1 = resolve(base, entry.name);
    // direct package
    out.push(lvl1);
    // nested packages
    for (const sub of readdirSync(lvl1, { withFileTypes: true })) {
      if (sub.isDirectory()) out.push(resolve(lvl1, sub.name));
    }
  }
  return out;
}

function getDirSizeKB(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of readdirSync(cur, { withFileTypes: true })) {
      const full = resolve(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else total += statSync(full).size;
    }
  }
  return Math.round(total / 1024);
}

(function main() {
  const repoRoot = process.cwd();
  const pkgs = listPackages(repoRoot);
  const thresholds = process.env.SIZE_THRESHOLD_JSON ? JSON.parse(process.env.SIZE_THRESHOLD_JSON) : {};

  let totalKB = 0;
  let fail = false;
  const rows = [];

  for (const pkgDir of pkgs) {
    const dist = resolve(pkgDir, 'dist');
    try {
      const sizeKB = getDirSizeKB(dist);
      totalKB += sizeKB;
      const name = pkgDir.split('/').slice(-1)[0];
      rows.push({ name, sizeKB });
      const th = thresholds[name];
      if (typeof th === 'number' && sizeKB > th) {
        console.error(`[bundle] ${name}: ${sizeKB}KB exceeds threshold ${th}KB`);
        fail = true;
      }
    } catch {
      // ignore packages without dist
    }
  }

  rows.sort((a, b) => b.sizeKB - a.sizeKB);
  console.log('\nBundle size report (KB):');
  for (const r of rows) console.log(` - ${r.name}: ${r.sizeKB}`);
  console.log(`Total: ${totalKB}KB`);

  if (fail) process.exit(1);
})();
