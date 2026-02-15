#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Docs API determinism check
 * - Generates API docs into a temp directory using SWISS_DOCS_API_OUTDIR
 * - Compares with committed docs/api
 * - Fails if any diff is detected
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

(function main() {
  const prefix = mkdtempSync(resolve(tmpdir(), `swiss-docs-api-${Date.now()}-`));
  const relOut = ['.tmp-docs', prefix.split(sep).pop()].filter(Boolean).join('-');
  const outDir = resolve(process.cwd(), 'docs', relOut);

  try {
    // Generate into temp output dir (apply env to both commands)
    const envPrefix = `SWISS_DOCS_STRICT=1 SWISS_DOCS_API_OUTDIR=${['docs', relOut].join('/')}`;
    run('bash', ['-lc', `${envPrefix} pnpm docs:api && ${envPrefix} pnpm docs:api:index`]);

    // Compare with committed docs/api
    const diff = spawnSync('bash', ['-lc', `git diff --no-index -- docs/api ${outDir}`], { stdio: 'inherit' });
    if (diff.status !== 0) {
      console.error('\n[Determinism] docs/api differs from a clean regeneration. Commit or fix non-determinism.');
      process.exit(1);
    }
    console.log('[Determinism] docs/api is deterministic.');
  } finally {
    // Cleanup the temp outDir
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[Determinism] Cleanup warning:', e?.message ?? String(e));
    }
  }
})();
