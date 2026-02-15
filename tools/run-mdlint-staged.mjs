#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
// Filter out generated API docs and other excluded paths
const filtered = args.filter((raw) => {
  const p = raw.replace(/^\.\/?/, '');
  const rel = p.startsWith('/') ? p : p;
  return !(
    rel.includes('docs/api/') ||
    rel.startsWith('docs/.tmp-docs-') ||
    rel.includes('/node_modules/') ||
    rel.includes('/dist/') ||
    rel.includes('docs/.vitepress/dist/') ||
    rel.startsWith('docs_old/') ||
    rel.startsWith('jira/')
  );
});

if (filtered.length === 0) {
  // Nothing to lint
  process.exit(0);
}

const child = spawn('markdownlint-cli2', filtered, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
