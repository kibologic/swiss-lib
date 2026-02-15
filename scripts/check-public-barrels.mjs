#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const pkgsRoot = path.resolve(process.cwd(), 'packages');

function* findPublicBarrels() {
  // Only match: packages/<name>/src/index.ts
  const packages = fs.readdirSync(pkgsRoot, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const pkg of packages) {
    const p = path.join(pkgsRoot, pkg.name, 'src', 'index.ts');
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      yield p;
    }
  }
}

const offenders = [];
for (const barrel of findPublicBarrels()) {
  const src = fs.readFileSync(barrel, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*export\s*\*/.test(line)) {
      offenders.push(`${barrel}:${i + 1}: wildcard export not allowed in public barrel`);
    }
  });
}

if (offenders.length) {
  console.error('Wildcard exports are not allowed in public barrels (packages/*/src/index.ts).');
  for (const o of offenders) console.error(o);
  process.exit(1);
} else {
  console.log('check-public-barrels: OK');
}
