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
const mode = process.argv.includes('--list') ? 'list' : 'check';
const enforceFlag = process.argv.includes('--enforce');
const envRef = process.env.GITHUB_REF || '';
const isStagingOrReleaseRef = /refs\/heads\/(staging|release)/.test(envRef);
const enforce = enforceFlag || process.env.PROMOTION_ENFORCE === '1' || isStagingOrReleaseRef;

// Denylist globs (simple suffix/prefix/contains checks for portability)
const denyNames = new Set([
  '.env', '.env.local', '.env.production', '.env.staging', '.env.development',
]);
const denySuffixes = [
  '.pem', '.key', '.p8', '.p12', '.crt', '.cer', '.der', '.asc', '.gpg',
];
const denyContains = [
  '/internal/', '/secrets/', '/private/', '/__tests__/', '/.github/',
];
const denyPaths = [
  'docs/internal/',
];

// Skip typical outputs and dependencies
const ignoreContains = [
  '/node_modules/', '/dist/', '/.turbo/', '/.git/', '/docs/.vitepress/dist/', '/docs/api/'
];

function shouldIgnore(p) {
  return ignoreContains.some(s => p.includes(s));
}

function fileViolates(p, name) {
  if (denyPaths.some(dp => p.startsWith(path.join(root, dp)))) return true;
  if (denyNames.has(name)) return true;
  if (denySuffixes.some(s => name.endsWith(s))) return true;
  if (denyContains.some(s => p.includes(s))) return true;
  return false;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (shouldIgnore(p)) continue;
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function main() {
  const files = walk(root);
  const offenders = [];
  for (const f of files) {
    const name = path.basename(f);
    if (fileViolates(f, name)) offenders.push(path.relative(root, f));
  }
  if (mode === 'list') {
    offenders.forEach(o => console.log(o));
    process.exit(0);
  }
  if (offenders.length) {
    const header = enforce ? '[promotion-filter] Found disallowed files for promotion:' : '[promotion-filter] (non-enforcing) Potentially disallowed files:';
    console.error(header);
    offenders.slice(0, 200).forEach(o => console.error(' -', o));
    if (offenders.length > 200) console.error(` ... and ${offenders.length - 200} more`);
    if (enforce) process.exit(1);
    console.log('[promotion-filter] Non-enforcing mode: reporting only.');
    process.exit(0);
  }
  console.log('[promotion-filter] OK: no disallowed files detected.');
}

main();
