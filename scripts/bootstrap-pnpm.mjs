#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
import { execSync } from 'node:child_process';

const PNPM_VERSION = '10.12.4';

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

console.log(`[bootstrap] Ensuring pnpm@${PNPM_VERSION} via Corepack...`);
const corepackOk = run('corepack enable') && run(`corepack prepare pnpm@${PNPM_VERSION} --activate`);

if (!corepackOk) {
  console.warn('[bootstrap] Corepack not available or failed to activate pnpm.');
  console.warn('[bootstrap] Fallback instructions:');
  console.warn('  - If npm exists:  npm install -g pnpm@' + PNPM_VERSION);
  console.warn('  - Then verify:    pnpm -v');
  // Try fallback automatically if npm exists
  const npmOk = run('npm -v');
  if (npmOk) {
    console.log('[bootstrap] Attempting fallback: npm install -g pnpm@' + PNPM_VERSION);
    if (!run(`npm install -g pnpm@${PNPM_VERSION}`)) {
      console.error('[bootstrap] Fallback install via npm failed. Please install pnpm manually.');
      process.exit(1);
    }
  } else {
    console.error('[bootstrap] npm is not available. Please install Node.js 18 LTS which includes npm.');
    process.exit(1);
  }
}

console.log('[bootstrap] Verifying pnpm...');
if (!run('pnpm -v')) {
  console.error('[bootstrap] pnpm not available on PATH after activation. Open a new terminal and try again.');
  process.exit(1);
}

console.log('[bootstrap] pnpm is ready. You can now run: pnpm -w reset');
