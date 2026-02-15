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
const docsDir = path.join(root, 'docs', 'api');
const mode = process.argv.includes('--fix') ? 'fix' : 'check';

const patterns = [
  /@internal/gi,
  /\bInternal\b/gi,
  /\bDev[- ]?only\b/gi,
  /\bDO NOT PUBLISH\b/gi,
];

function walk(dir) {
  const out = [];
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && /(\.md|\.json|\.html?)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function redactFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  let text = original;
  let matched = false;
  for (const rx of patterns) {
    if (rx.test(text)) {
      matched = true;
      if (mode === 'fix') {
        text = text.replace(rx, '');
      }
      rx.lastIndex = 0; // reset
    }
  }
  if (mode === 'fix' && text !== original) {
    fs.writeFileSync(file, text, 'utf8');
  }
  return matched;
}

function main() {
  const files = walk(docsDir);
  if (!files.length) {
    console.log('[docs-redactor] No docs found at', docsDir);
    process.exit(0);
  }
  let flagged = [];
  for (const f of files) {
    const hit = redactFile(f);
    if (hit && mode === 'check') flagged.push(f);
  }
  if (flagged.length) {
    console.error('[docs-redactor] Found potentially sensitive tokens in docs artifacts:');
    for (const f of flagged) console.error(' -', path.relative(root, f));
    console.error('Run: node scripts/docs-redactor.mjs --fix to scrub locally, or update sources/typedoc configs.');
    process.exit(1);
  }
  console.log(`[docs-redactor] ${mode === 'fix' ? 'Redaction applied.' : 'No sensitive tokens detected.'}`);
}

main();
