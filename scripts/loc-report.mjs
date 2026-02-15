#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';

const ROOT = resolve(process.cwd());
const PKG_DIRS = [
  join(ROOT, 'packages'),
  join(ROOT, 'packages', 'plugins'),
  join(ROOT, 'packages', 'devtools'),
].filter((p) => existsSync(p));

const INCLUDE_DIRS = new Set(['src', 'scripts']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.vitepress']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function isIncludedFile(filePath) {
  const ext = extname(filePath);
  return EXTENSIONS.has(ext);
}

function listPackages(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(root, d.name))
      .filter((p) => existsSync(join(p, 'package.json')));
  } catch {
    return [];
  }
}

function walkDir(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walkDir(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function countFile(path) {
  const content = readFileSync(path, 'utf8');
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0).length;
  return { total: lines.length, nonEmpty };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function computeForPackage(pkgPath) {
  const pkgJson = readJson(join(pkgPath, 'package.json')) || {};
  const name = pkgJson.name || basename(pkgPath);

  const candidateDirs = readdirSync(pkgPath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && INCLUDE_DIRS.has(d.name))
    .map((d) => join(pkgPath, d.name));

  let files = [];
  for (const d of candidateDirs) {
    files.push(...walkDir(d, []));
  }
  files = files.filter(isIncludedFile);

  let total = 0; let nonEmpty = 0;
  const byFile = {};
  for (const f of files) {
    const { total: t, nonEmpty: n } = countFile(f);
    total += t; nonEmpty += n;
    byFile[f.replace(ROOT + '/', '')] = { total: t, nonEmpty: n };
  }

  return { name, path: pkgPath.replace(ROOT + '/', ''), total, nonEmpty, files: files.length, byFile };
}

function main() {
  const packages = [];
  for (const root of PKG_DIRS) {
    for (const pkg of listPackages(root)) {
      packages.push(computeForPackage(pkg));
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    totals: {
      packages: packages.length,
      files: packages.reduce((a, p) => a + p.files, 0),
      total: packages.reduce((a, p) => a + p.total, 0),
      nonEmpty: packages.reduce((a, p) => a + p.nonEmpty, 0),
    },
    packages: packages.sort((a, b) => b.nonEmpty - a.nonEmpty),
    note: 'Lines counted as total and non-empty (non-empty excludes blank lines). Comments are included as non-empty for simplicity.'
  };

  const etcDir = join(ROOT, 'etc', 'metrics');
  const docsDir = join(ROOT, 'docs', 'metrics');
  mkdirSync(etcDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const jsonPath = join(etcDir, 'loc.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const mdLines = [];
  mdLines.push('# LOC Report');
  mdLines.push('');
  mdLines.push(`Generated: ${summary.generatedAt}`);
  mdLines.push('');
  mdLines.push(`- Packages: ${summary.totals.packages}`);
  mdLines.push(`- Files: ${summary.totals.files}`);
  mdLines.push(`- Total lines: ${summary.totals.total}`);
  mdLines.push(`- Non-empty lines: ${summary.totals.nonEmpty}`);
  mdLines.push('');
  mdLines.push('## Per Package (sorted by non-empty lines)');
  mdLines.push('');
  for (const p of summary.packages) {
    mdLines.push(`- ${p.name} (${p.path}): total=${p.total}, nonEmpty=${p.nonEmpty}, files=${p.files}`);
  }
  mdLines.push('');
  mdLines.push('> Note: Non-empty counts exclude blank lines but include comment lines.');

  const mdPath = join(docsDir, 'loc.md');
  writeFileSync(mdPath, mdLines.join('\n'));

  console.log('[LOC] Wrote', jsonPath);
  console.log('[LOC] Wrote', mdPath);
}

main();
