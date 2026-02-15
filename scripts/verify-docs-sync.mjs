#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
// verify-docs-sync.mjs
// Ensures that when source files change, corresponding docs updates are staged too.
// - Looks at currently STAGED files (pre-commit safe)
// - If any code files under packages/**/src change (ts/tsx/js/ui), requires at least one staged file under docs/
// - Skips __tests__, dist, templates, node_modules
// - Override: set DOCS_SYNC_SKIP=1 to bypass (e.g., for trivial changes)
import { execSync } from 'node:child_process';

function getStagedFiles() {
  try {
    const out = execSync('git diff --name-only --cached', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return out.split('\n').filter(Boolean);
  } catch /* ignore */ {
    return [];
  }
}

function isCodeFile(p) {
  // Match packages/*/src/**/*.ts|tsx|js|ui|uix but exclude tests and generated dirs
  if (!p.startsWith('packages/')) return false;
  if (!p.includes('/src/')) return false;
  if (p.includes('/__tests__/')) return false;
  if (p.includes('/dist/')) return false;
  if (p.includes('/templates/')) return false;
  return /(\.(ts|tsx|js|ui|uix))$/.test(p);
}

function isDocsFile(p) {
  // Consider anything under docs/* as docs, but prioritize docs/api/** and docs/reports/**
  return p.startsWith('docs/');
}

function main() {
  if (process.env.DOCS_SYNC_SKIP === '1') {
    console.log('[verify-docs-sync] Skipped by DOCS_SYNC_SKIP=1');
    process.exit(0);
  }
  const staged = getStagedFiles();
  const codeTouched = staged.some(isCodeFile);
  if (!codeTouched) {
    console.log('[verify-docs-sync] No relevant source changes detected.');
    process.exit(0);
  }
  const docsTouched = staged.some(isDocsFile);
  if (!docsTouched) {
    console.error('[verify-docs-sync] Source changes detected under packages/**/src but no docs/ updates are staged.');
    console.error('Please run the docs build for develop and stage the results (e.g., docs/api changes), or set DOCS_SYNC_SKIP=1 to bypass.');
    console.error('Tips:');
    console.error(' - Run your docs generation command (per repo docs).');
    console.error(' - Stage docs/ changes, then commit again.');
    process.exit(1);
  }
  console.log('[verify-docs-sync] OK: docs updates staged alongside source changes.');
}

main();
