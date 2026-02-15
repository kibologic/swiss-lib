#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
  SwissJS API Docs Generator (per-package)
  - Uses TypeDoc programmatic API
  - If typedoc-plugin-markdown is installed, generates Markdown
  - Otherwise, generates HTML
  - Output directory: docs/api/<package-name>
*/
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

async function generateForPackage(pkgDir) {
  const { Application } = await import('typedoc');

  const srcIndex = resolve(pkgDir, 'src', 'index.ts');
  if (!existsSync(srcIndex)) return false;

  // Detect markdown plugin
  let useMarkdown = false;
  try {
    await import('typedoc-plugin-markdown');
    useMarkdown = true;
  } catch {
    useMarkdown = false;
  }

  const pkgName = dirname(pkgDir).split('/').pop() + '/' + pkgDir.split('/').pop();
  const outputRoot = resolve(repoRoot, 'docs', 'api');
  mkdirSync(outputRoot, { recursive: true });
  const outDir = resolve(outputRoot, pkgDir.split('/').slice(-2).join('-'));

  const opts = {
    entryPoints: [srcIndex],
    plugin: useMarkdown ? ['typedoc-plugin-markdown'] : [],
    out: outDir,
    name: pkgName,
    skipErrorChecking: true,
    excludePrivate: true,
    excludeProtected: false,
    excludeInternal: true,
    readme: 'none',
  };
  const tsconfigPath = resolve(pkgDir, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    opts.tsconfig = tsconfigPath;
  }
  const app = await Application.bootstrapWithPlugins(opts);

  const project = app.convert();
  if (!project) {
    console.warn(`[TypeDoc] Skipped ${pkgDir} (conversion failed)`);
    return false;
  }

  if (useMarkdown) {
    await app.generateDocs(project, outDir);
    console.log(`[TypeDoc] Generated API for ${pkgDir} -> ${outDir} (markdown)`);
  } else {
    const jsonOut = resolve(outDir, 'reflection.json');
    await app.generateJson(project, jsonOut);
    console.log(`[TypeDoc] Generated API JSON for ${pkgDir} -> ${jsonOut}`);
  }
  return true;
}

function findPackages(root) {
  const dirs = [];
  for (const scope of ['packages']) {
    const scopeDir = resolve(root, scope);
    if (!existsSync(scopeDir)) continue;
    const entries = readdirSync(scopeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = resolve(scopeDir, entry.name);
      // include nested like packages/plugins/* and packages/devtools/*
      const subentries = readdirSync(full, { withFileTypes: true });
      let hasSrc = existsSync(resolve(full, 'src'));
      if (hasSrc) {
        dirs.push(full);
      }
      for (const se of subentries) {
        if (se.isDirectory()) {
          const sub = resolve(full, se.name);
          if (existsSync(resolve(sub, 'src'))) dirs.push(sub);
        }
      }
    }
  }
  return dirs;
}

(async function main() {
  const pkgs = findPackages(repoRoot);
  let count = 0;
  for (const p of pkgs) {
    const ok = await generateForPackage(p);
    if (ok) count++;
  }
  console.log(`\n[TypeDoc] Completed (${count}) packages.`);
})();
