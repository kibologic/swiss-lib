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

function stripComments(jsonText) {
  return jsonText
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|\s)\/\/.*$/gm, ''); // line comments
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const roots = [path.join(repoRoot, 'packages'), path.join(repoRoot, 'apps')];

const offenders = [];

function checkTsconfig(file) {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  let json;
  try {
    json = JSON.parse(stripComments(raw));
  } catch (e) {
    offenders.push(`${path.relative(repoRoot, file)} (invalid JSON: ${e.message})`);
    return;
  }
  const co = json?.compilerOptions ?? {};
  const outDir = co.outDir;
  const noEmit = co.noEmit === true;
  // Allow packages that do not emit at all
  if (!noEmit) {
    const ok = outDir === 'dist' || outDir === './dist';
    if (!ok) {
      offenders.push(`${path.relative(repoRoot, file)} (compilerOptions.outDir should be "dist")`);
    }
  }
}

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
    } else if (entry.isFile() && entry.name === 'tsconfig.json') {
      checkTsconfig(full);
    }
  }
}

for (const r of roots) walk(r);

if (offenders.length) {
  console.error('[tsconfig outDir Check] Problems found:');
  for (const f of offenders) console.error(' -', f);
  console.error('\nPolicy: All package/app tsconfig.json must set compilerOptions.outDir to "dist".');
  process.exit(1);
}

console.log('[tsconfig outDir Check] OK: all tsconfig.json files set outDir to dist.');
