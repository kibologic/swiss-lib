#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
/*
  Build API report baselines.
  - Copies docs/api/<pkg>/reflection.json to etc/api/<pkg>.json
  - Ensures directories exist
*/
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const repoRoot = process.cwd();
const docsApiRoot = join(repoRoot, 'docs', 'api');
const outRoot = join(repoRoot, 'etc', 'api');

function listPackages() {
  try {
    return readdirSync(docsApiRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function main() {
  const pkgs = listPackages();
  let count = 0;
  mkdirSync(outRoot, { recursive: true });
  for (const p of pkgs) {
    const src = join(docsApiRoot, p, 'reflection.json');
    if (!existsSync(src)) continue;
    const dst = join(outRoot, `${p}.json`);
    const data = readFileSync(src, 'utf8');
    writeFileSync(dst, data);
    console.log(`[API Report] Wrote baseline for ${p} -> ${basename(dst)}`);
    count++;
  }
  console.log(`[API Report] Baselines updated (${count}).`);
}

main();
