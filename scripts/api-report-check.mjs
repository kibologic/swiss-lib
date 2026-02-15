#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
/*
  Check API report drift.
  - Compares etc/api/<pkg>.json (baseline) to docs/api/<pkg>/reflection.json (fresh)
  - Fails if any differences are found
  - Prints a concise diff summary (size-only to keep CI logs clean)
*/
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const docsApiRoot = join(repoRoot, 'docs', 'api');
const baseRoot = join(repoRoot, 'etc', 'api');

function listBaselines() {
  try {
    return readdirSync(baseRoot, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function main() {
  const pkgs = listBaselines();
  let drift = 0;
  for (const p of pkgs) {
    const basePath = join(baseRoot, `${p}.json`);
    const freshPath = join(docsApiRoot, p, 'reflection.json');
    if (!existsSync(freshPath)) {
      console.error(`[API Check] Missing fresh reflection for ${p}: ${freshPath}`);
      drift++;
      continue;
    }
    const base = readFileSync(basePath, 'utf8');
    const fresh = readFileSync(freshPath, 'utf8');
    if (base !== fresh) {
      console.error(`[API Check] Drift detected for ${p} (sizes: base=${base.length}, fresh=${fresh.length})`);
      drift++;
    } else {
      console.log(`[API Check] OK ${p}`);
    }
  }
  if (drift) {
    console.error(`[API Check] Public API drift found in ${drift} package(s).`);
    process.exit(1);
  }
  console.log('[API Check] All packages match baselines.');
}

main();
