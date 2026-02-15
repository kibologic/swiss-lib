#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const targets = [path.join(repoRoot, 'packages'), path.join(repoRoot, 'apps')];

const offenders = [];

function walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile()) {
      const rel = full.replace(repoRoot + path.sep, '');
      if (rel.includes(`${path.sep}src${path.sep}`)) {
        if (rel.endsWith('.js')) {
          offenders.push(rel);
        } else if (rel.endsWith('.d.ts')) {
          // Allow ambient declaration sources (no sibling .ts). Flag only if a same-name .ts exists.
          const tsSibling = full.slice(0, -5) + '.ts';
          if (fs.existsSync(tsSibling)) {
            offenders.push(rel);
          }
        }
      }
    }
  }
}

for (const t of targets) walk(t);

if (offenders.length) {
  console.error('[Artifact Check] Build artifacts found under src/:');
  for (const f of offenders) console.error(' -', f);
  console.error('\nPolicy: src/ should only contain source (.ts) and intentional ambient declarations (.d.ts without a sibling .ts). Build outputs must go to dist/.');
  process.exit(1);
}

console.log('[Artifact Check] OK: no .js/.d.ts files found under src/.');
