#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
/*
  SwissJS Barrel Compliance Checker + Reporter
  - No default exports in package source files (ts/tsx/js under src)
  - Barrel files must use explicit .js extensions for local re-exports
  - No deep imports into @swissjs packages' internal src directories
  - Reporting (opt-in):
      --report-json <path>
      --report-md <path>
      --no-fail  (do not exit(1) on violations)
    The report includes per-package public API derived from each barrel (src/index.ts),
    listing export statements discovered.
*/
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';

const repoRoot = process.cwd();
const roots = [
  'packages',
];

const SRC_EXTS = new Set(['.ts', '.tsx', '.js']);

/** Recursively collect files */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function isSrcFile(file) {
  return file.includes('/src/') && SRC_EXTS.has(extname(file));
}

function isBarrel(file) {
  return file.endsWith('/src/index.ts') || file.endsWith('/src/index.ui');
}

// Simple CLI parsing
const argv = process.argv.slice(2);
let reportJson = null;
let reportMd = null;
let failOnViolation = true;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--report-json') reportJson = argv[++i];
  else if (a === '--report-md') reportMd = argv[++i];
  else if (a === '--no-fail') failOnViolation = false;
  else if (a === '--report') {
    reportJson = 'docs/reports/barrel-report.json';
    reportMd = 'docs/reports/barrel-report.md';
  }
}

const violations = [];
const report = {
  generatedAt: new Date().toISOString(),
  packages: [],
};

for (const root of roots) {
  const rootPath = join(repoRoot, root);
  let files = [];
  try {
    files = walk(rootPath);
  } catch /* ignore missing roots */ {
    // no-op
  }

  // 1) Default exports (any src file)
  for (const file of files) {
    if (!isSrcFile(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('export default')) {
      violations.push({
        type: 'default-export',
        file,
        message: `Default export found (not allowed): ${file}`,
      });
    }
  }

  // 2) Barrel re-exports without .js extension & collect public API
  for (const file of files) {
    if (!isBarrel(file)) continue;
    const raw = readFileSync(file, 'utf8');
    // If this is a .ui barrel, skip JS extension enforcement; .ui barrels are source entrypoints
    if (file.endsWith('/src/index.ui')) {
      const pkgRoot = file.slice(0, file.indexOf('/src/index.ui'));
      const pkgName = relative(repoRoot, pkgRoot);
      report.packages.push({
        package: pkgName,
        barrel: relative(repoRoot, file),
        exportStatements: [],
      });
      continue;
    }
    // Strip block comments and line comments
    const text = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
    const re = /from\s+['"](\.\.?\/[^'"\n]+)['"]/g;
    let m;
    const pkgRoot = file.slice(0, file.indexOf('/src/index.ts'));
    const pkgName = relative(repoRoot, pkgRoot);
    const api = [];
    // capture `export * from`, `export * as X from`, and named exports
    const exportStmtRe = /export\s+(?:\*\s+as\s+([A-Za-z_$][\w$]*)\s+from|\*\s+from|\{[^}]*\}\s+from)\s+['"][^'"]+['"]/g;
    let e;
    while ((e = exportStmtRe.exec(text)) !== null) {
      api.push(text.slice(e.index, exportStmtRe.lastIndex));
    }
    while ((m = re.exec(text)) !== null) {
      const imp = m[1];
      if (imp.startsWith('./') || imp.startsWith('../')) {
        if (!imp.endsWith('.js')) {
          violations.push({
            type: 'barrel-missing-js',
            file,
            message: `Barrel re-export without .js extension: ${imp} in ${file}`,
          });
        }
      }
    }
    report.packages.push({
      package: pkgName,
      barrel: relative(repoRoot, file),
      exportStatements: api,
    });
  }

  // 3) Deep imports bypassing barrels
  for (const file of files) {
    if (!isSrcFile(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (/@swissjs\/[^'"\n]+\/src\//.test(text)) {
      violations.push({
        type: 'deep-import',
        file,
        message: `Deep import to @swissjs/*/src/* found in ${file}`,
      });
    }
  }

  // 4) Missing barrel per package: if packages/*/<pkg>/src exists then require src/index.ts
  const pkgRoots = new Set();
  for (const f of files) {
    const idx = f.indexOf('/src/');
    if (idx === -1) continue;
    pkgRoots.add(f.slice(0, idx));
  }
  for (const pkgRoot of pkgRoots) {
    // Skip template scaffolds and non-packages
    if (pkgRoot.includes('/templates/')) continue;
    const pkgJsonPath = join(pkgRoot, 'package.json');
    const isRealPackage = existsSync(pkgJsonPath);
    if (!isRealPackage) continue;
    const srcDir = join(pkgRoot, 'src');
    let hasSrc = false;
    try { hasSrc = existsSync(srcDir) && statSync(srcDir).isDirectory(); } catch /* ignore */ { /* no-op */ }
    if (!hasSrc) continue;
    // Decide expected barrel: .ui or .ts
    let expectUiBarrel = false;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      const main = pkg?.main || '';
      if (typeof main === 'string' && /index\.ui$/.test(main)) expectUiBarrel = true;
    } catch /* ignore */ { /* no-op */ }
    // If any .ui files exist under src, prefer index.ui as the barrel
    if (!expectUiBarrel) {
      try {
        const hasUi = walk(srcDir).some(p => p.endsWith('.ui'));
        if (hasUi) expectUiBarrel = true;
      } catch /* ignore */ { /* no-op */ }
    }
    const barrelFile = join(srcDir, expectUiBarrel ? 'index.ui' : 'index.ts');
    const hasBarrel = existsSync(barrelFile);
    if (!hasBarrel) {
      violations.push({
        type: 'missing-barrel',
        file: relative(repoRoot, srcDir),
        message: `Missing barrel file: ${relative(repoRoot, barrelFile)} (required for packages with src/, .ui projects use index.ui)`,
      });
    }
  }
}

// Write reports if requested
function ensureParent(filePath) {
  try { mkdirSync(dirname(filePath), { recursive: true }); } catch /* ignore */ { /* no-op */ }
}

if (reportJson) {
  ensureParent(reportJson);
  writeFileSync(reportJson, JSON.stringify({ ...report, violations }, null, 2));
  console.log(`[SwissJS Barrel Check] Wrote JSON report => ${reportJson}`);
}
if (reportMd) {
  ensureParent(reportMd);
  const lines = [];
  lines.push('# Barrel Public API Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  for (const p of report.packages) {
    lines.push(`## ${p.package}`);
    lines.push(`- Barrel: \`${p.barrel}\``);
    if (p.exportStatements.length) {
      lines.push('- Exports:');
      for (const s of p.exportStatements) lines.push(`  - \`${s}\``);
    } else {
      lines.push('- Exports: (none detected)');
    }
    lines.push('');
  }
  if (violations.length) {
    lines.push('---');
    lines.push('');
    lines.push('## Violations');
    for (const v of violations) lines.push(`- [${v.type}] ${v.message}`);
  }
  writeFileSync(reportMd, lines.join('\n'));
  console.log(`[SwissJS Barrel Check] Wrote Markdown report => ${reportMd}`);
}

if (violations.length) {
  console.error('\n[SwissJS Barrel Check] Violations found:', violations.length);
  for (const v of violations) console.error(`- [${v.type}] ${v.message}`);
  if (failOnViolation) process.exit(1);
}
if (!violations.length) console.log('[SwissJS Barrel Check] All good.');

// Optional: suggestion mode to help authors create barrels
const wantSuggest = process.argv.includes('--suggest');
if (wantSuggest) {
  function ensureParent(filePath) {
    try { mkdirSync(dirname(filePath), { recursive: true }); } catch (e) { console.error(`Error creating directory for ${filePath}: ${e}`); }
  }
  const suggest = [];
  for (const root of roots) {
    const rootPath = join(repoRoot, root);
    let files = [];
    try { files = walk(rootPath); } catch /* ignore */ { /* no-op */ }
    // Group by package root (…/packages/<name>)
    const byPkg = new Map();
    for (const f of files) {
      const idx = f.indexOf('/src/');
      if (idx === -1) continue;
      const pkgRoot = f.slice(0, idx);
      if (!byPkg.has(pkgRoot)) byPkg.set(pkgRoot, []);
      byPkg.get(pkgRoot).push(f);
    }
    for (const [pkgRoot, list] of byPkg.entries()) {
      const barrelPath = join(pkgRoot, 'src/index.ts');
      const pkgName = relative(repoRoot, pkgRoot);
      const hasBarrel = list.includes(barrelPath);
      // Collect candidate files for export suggestions (same package)
      const candidates = list
        .filter(p => isSrcFile(p) && p !== barrelPath)
        .map(p => {
          // Build a relative path from barrel file (index.ts) with explicit .js
          const rel = relative(join(pkgRoot, 'src'), p).replace(/\\/g, '/');
          const noExt = rel.replace(/\.(ts|tsx|js)$/i, '');
          return `export * from "./${noExt}.js";`;
        })
        // De-duplicate identical lines
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort();

      suggest.push({ package: pkgName, hasBarrel, barrel: relative(repoRoot, barrelPath), suggestions: candidates });
    }
  }

  // Write JSON and Markdown suggestions (non-destructive output)
  const outJson = 'docs/reports/barrel-suggest.json';
  const outMd = 'docs/reports/barrel-suggest.md';
  ensureParent(outJson); ensureParent(outMd);
  writeFileSync(outJson, JSON.stringify({ generatedAt: new Date().toISOString(), suggest }, null, 2));
  const md = [];
  md.push('# Barrel Suggestions');
  md.push('');
  md.push('Non-destructive suggestions to help complete barrels.');
  md.push('');
  for (const s of suggest) {
    md.push(`## ${s.package}`);
    md.push(`- Barrel: \`${s.barrel}\` (${s.hasBarrel ? 'exists' : 'missing'})`);
    if (s.suggestions.length) {
      md.push('```ts');
      for (const line of s.suggestions) md.push(line);
      md.push('```');
    } else {
      md.push('_No suggestions_');
    }
    md.push('');
  }
  writeFileSync(outMd, md.join('\n'));
  console.log(`[SwissJS Barrel Check] Wrote suggestions => ${outMd}, ${outJson}`);
}
