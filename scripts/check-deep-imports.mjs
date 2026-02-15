#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(process.cwd());
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);
const ignoreDirs = new Set(['node_modules', 'dist', '.turbo', '.git']);

// Note: We only allow top-level package imports like @swissjs/core (no deep paths)

/**
 * Returns true if the import specifier is a deep import into a @swissjs/* package.
 * e.g. @swissjs/core/src/..., @swissjs/core/plugins/..., etc.
 */
const ALLOW_SUBPATHS = new Set([
  '@swissjs/core/jsx-runtime',
  '@swissjs/core/jsx-dev-runtime',
  '@swissjs/core/plugins',
]);

function isDeepSwissImport(spec) {
  if (!spec.startsWith('@swissjs/')) return false;
  const without = spec.replace(/^@swissjs\//, '');
  // allow whitelisted public subpaths
  if (ALLOW_SUBPATHS.has(spec)) return false;
  // if it contains a slash after the package name, it's deep
  return without.includes('/');
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else if (exts.has(path.extname(entry.name))) {
      yield p;
    }
  }
}

const offenders = [];
for (const file of walk(repoRoot)) {
  const src = fs.readFileSync(file, 'utf8');
  // very simple import matcher (handles import ... from 'x' and export ... from 'x')
  const re = /(import|export)\s+[^;]*?from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[2];
    if (isDeepSwissImport(spec)) {
      offenders.push(`${file}: deep import -> ${spec}`);
    }
  }
}

if (offenders.length) {
  console.error('Deep @swissjs/* imports are not allowed. Use package barrels only.\n');
  for (const line of offenders) console.error(line);
  process.exit(1);
} else {
  console.log('check-deep-imports: OK');
}
