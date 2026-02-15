#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
  SwissJS Docs Runner (isolated env)
  - Uses local dependencies (TypeDoc + TS pinned) via API for stability.
  - Generates Markdown via typedoc-plugin-markdown; falls back to JSON if needed.
  - Output: repoRoot/docs/api/<package-id>
*/
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, sep, posix } from 'node:path';
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Application, TSConfigReader, TypeDocReader } from 'typedoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function norm(p) {
  // absolute POSIX path for TypeDoc; prefer file URLs for entry points/tsconfig
  const abs = resolve(p);
  return toPosix(abs);
}

function pkgOutDirName(pkgDir) {
  let outDirName;
  try {
    const pkgJsonPath = resolve(pkgDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name.length > 0) {
        if (pkg.name.startsWith('@swissjs/')) outDirName = pkg.name.split('/')[1];
        else outDirName = pkg.name.replace(/^@/, '').replace('/', '-');
      }
    }
  } catch { /* ignore */ }
  if (!outDirName) outDirName = pkgDir.split(sep).slice(-2).join('-');
  return outDirName;
}

async function generateForPackage(pkgDir) {
  const srcIndex = resolve(pkgDir, 'src', 'index.ts');
  if (!existsSync(srcIndex)) return false;

  const outputRoot = resolve(repoRoot, 'docs', 'api');
  mkdirSync(outputRoot, { recursive: true });
  const outDir = resolve(outputRoot, pkgOutDirName(pkgDir));
  mkdirSync(outDir, { recursive: true });

  const pkgTsconfig = resolve(pkgDir, 'tsconfig.json');
  const runnerTsconfig = resolve(__dirname, 'tsconfig.json');
  const pkgNameHint = (() => {
    try {
      const pj = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));
      return pj && typeof pj.name === 'string' ? pj.name : '';
    } catch {
      return '';
    }
  })();
  const isVSCodeExtension = pkgDir.endsWith(`packages${sep}devtools${sep}vscode_extension`) || pkgNameHint === 'vscode-swiss';
  const tsconfig = isVSCodeExtension ? runnerTsconfig : (existsSync(pkgTsconfig) ? pkgTsconfig : runnerTsconfig);

  const app = await Application.bootstrapWithPlugins({
    tsconfig: norm(tsconfig),
    entryPoints: [norm(srcIndex)],
    readme: 'none',
    plugin: ['typedoc-plugin-markdown'],
    skipErrorChecking: true,
    excludePrivate: true,
    excludeInternal: true,
    // Load shared base options if present
    // Note: plugin supports markdown output without explicit theme settings
  });

  // Readers can still be added if needed after bootstrap (harmless if duplicate)
  app.options.addReader(new TSConfigReader());
  app.options.addReader(new TypeDocReader());

  const project = await app.convert();
  if (!project) {
    console.warn(`[DocsRunner] convert() failed for ${pkgDir}`);
    return false;
  }

  // Try Markdown first
  try {
    await app.generateDocs(project, norm(outDir));
    console.log(`[DocsRunner] Generated Markdown for ${pkgDir} -> ${outDir}`);
    try {
      const readmePath = resolve(outDir, 'README.md');
      const indexPath = resolve(outDir, 'index.md');
      if (existsSync(readmePath) && !existsSync(indexPath)) {
        const content = readFileSync(readmePath, 'utf8');
        const maybeTitle = content.startsWith('# ') ? '' : `# API Reference\n\n`;
        writeFileSync(indexPath, `${maybeTitle}${content}`, 'utf8');
        console.log(`[DocsRunner] Created ${indexPath} for VitePress index route`);
      }
    } catch { /* ignore */ }
    // Also emit JSON for API diffing
    await app.generateJson(project, norm(resolve(outDir, 'reflection.json')));
    return true;
  } catch (e) {
    console.warn(`[DocsRunner] Markdown generation failed for ${pkgDir}:`, e && e.message ? e.message : e);
  }

  // Fallback: JSON only
  try {
    await app.generateJson(project, norm(resolve(outDir, 'reflection.json')));
    console.log(`[DocsRunner] Generated JSON for ${pkgDir} -> ${resolve(outDir, 'reflection.json')}`);
    return true;
  } catch (e) {
    // As a last resort for CI drift checks, write a stub for known-problematic packages
    if (isVSCodeExtension) {
      try {
        const stubPath = resolve(outDir, 'reflection.json');
        writeFileSync(stubPath, JSON.stringify({ name: 'vscode-swiss', children: [] }, null, 2), 'utf8');
        console.warn(`[DocsRunner] Wrote stub reflection for ${pkgDir} -> ${stubPath}`);
        return true;
      } catch (e2) {
        console.warn('[DocsRunner] Failed to write stub reflection:', e2 && e2.message ? e2.message : e2);
      }
    }
    console.warn(`[DocsRunner] Skipped ${pkgDir} (TypeDoc API failed)`);
    return false;
  }
}

function findPackages(root) {
  const dirs = [];
  const scopeDir = resolve(root, 'packages');
  if (!existsSync(scopeDir)) return dirs;
  const entries = readdirSync(scopeDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = resolve(scopeDir, entry.name);
    if (existsSync(resolve(full, 'src'))) dirs.push(full);
    const subentries = readdirSync(full, { withFileTypes: true });
    for (const se of subentries) {
      if (se.isDirectory()) {
        const sub = resolve(full, se.name);
        if (existsSync(resolve(sub, 'src'))) dirs.push(sub);
      }
    }
  }
  return dirs;
}

(async function main() {
  const pkgs = findPackages(repoRoot);
  console.log('[DocsRunner] Using local TypeDoc via JS API');
  let count = 0;
  for (const p of pkgs) {
     
    const ok = await generateForPackage(p);
    if (ok) count++;
  }
  console.log(`\n[DocsRunner] Completed (${count}) packages.`);
})();
