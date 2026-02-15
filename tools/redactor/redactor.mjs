#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Simple docs redactor.
 * - Removes blocks between <!-- @internal-start --> and <!-- @internal-end -->
 * - Removes lines containing <!-- @todo-internal -->
 * - Copies other files verbatim
 *
 * Usage:
 *   node tools/redactor/redactor.mjs --src docs/public --out staging/public-docs-build
 *   node tools/redactor/redactor.mjs --check --src docs/public  # exits non-zero if internal markers are present
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const INTERNAL_START = '<!-- @internal-start -->';
const INTERNAL_END = '<!-- @internal-end -->';
const INTERNAL_LINE = '<!-- @todo-internal -->';

function parseArgs(argv) {
  const args = { src: '', out: '', check: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i] ?? '';
    else if (a === '--out') args.out = argv[++i] ?? '';
    else if (a === '--check') args.check = true;
  }
  return args;
}

function shouldProcessText(file) {
  const ext = path.extname(file).toLowerCase();
  return ['.md', '.mdx', '.markdown', '.html', '.htm'].includes(ext);
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function redactContent(content) {
  let out = [];
  let skipping = false;
  let foundMarker = false;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.includes(INTERNAL_START)) {
      skipping = true;
      foundMarker = true;
      continue;
    }
    if (line.includes(INTERNAL_END)) {
      skipping = false;
      foundMarker = true;
      continue;
    }
    if (line.includes(INTERNAL_LINE)) {
      foundMarker = true;
      continue; // drop this single line
    }
    if (!skipping) out.push(line);
  }
  return { text: out.join('\n'), foundMarker };
}

async function copyAndRedact(srcRoot, outRoot, checkOnly) {
  let foundAny = false;
  for await (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file);
    const dest = path.join(outRoot, rel);
    await ensureDir(path.dirname(dest));
    if (shouldProcessText(file)) {
      const raw = await fsp.readFile(file, 'utf8');
      const { text, foundMarker } = redactContent(raw);
      if (checkOnly && foundMarker) {
        foundAny = true;
      }
      if (!checkOnly) {
        await fsp.writeFile(dest, text, 'utf8');
      }
    } else {
      if (!checkOnly) {
        await fsp.copyFile(file, dest);
      }
    }
  }
  if (checkOnly && foundAny) {
    throw new Error('Internal markers found in public docs (use redactor to sanitize).');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.src) {
    console.error('Missing --src <dir>');
    process.exit(2);
  }
  if (!args.check && !args.out) {
    console.error('Missing --out <dir> for write mode');
    process.exit(2);
  }
  const srcAbs = path.resolve(process.cwd(), args.src);
  const outAbs = args.out ? path.resolve(process.cwd(), args.out) : '';
  if (!fs.existsSync(srcAbs)) {
    console.error(`Source not found: ${srcAbs}`);
    process.exit(2);
  }
  if (!args.check) await ensureDir(outAbs);
  await copyAndRedact(srcAbs, outAbs, args.check);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
