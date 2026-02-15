#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
import fs from 'fs';
import path from 'path';
import process from 'node:process';

const repoRoot = process.cwd();

/**
 * Recursively collect files with a given predicate
 */
async function walk(dir, predicate, acc = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function fail(msgs) {
  console.error('\n❌ UI format check failed:');
  for (const m of msgs) console.error('  -', m);
  process.exit(1);
}

(async () => {
  const errors = [];

  // 1) Enforce no legacy .1ui.hbs templates remain in CLI templates
  const cliTemplatesDir = path.join(repoRoot, 'packages', 'cli', 'templates');
  try {
    const legacyTemplates = await walk(cliTemplatesDir, (p) => p.endsWith('.1ui.hbs'));
    if (legacyTemplates.length > 0) {
      for (const f of legacyTemplates) {
        errors.push(`Legacy template file found: ${path.relative(repoRoot, f)} (rename to .ui.hbs and update contents)`);
      }
    }
  } catch {
    // ignore missing templates dir in some workspace states
  }

  // 2) Enforce .ui and .uix files contain no legacy markers and no inline styles
  const allUi = await walk(repoRoot, (p) => p.endsWith('.ui') || p.endsWith('.uix'));
  for (const file of allUi) {
    const text = await fs.promises.readFile(file, 'utf8');

    // Check for inline <style> tags (not allowed - styles must be in CSS files)
    if (/<style[\s>]/i.test(text)) {
      errors.push(`'${path.relative(repoRoot, file)}' contains <style> tag. Styles must be in separate CSS files, not inline in .ui/.uix files.`);
    }

    if (/<template[\s>]/i.test(text)) {
      errors.push(`'${path.relative(repoRoot, file)}' contains <template> markup. .ui/.uix must be pure TypeScript with html\`\``);
    }
    if (/jsxImportSource/.test(text)) {
      errors.push(`'${path.relative(repoRoot, file)}' contains jsxImportSource pragma which is not allowed in .ui/.uix`);
    }
    if (/createElement\s*[,)]|\bReact\b/.test(text)) {
      errors.push(`'${path.relative(repoRoot, file)}' appears to rely on JSX runtime/createElement; not allowed in .ui/.uix`);
    }
  }

  if (errors.length) fail(errors);
  console.log('✅ UI format check passed.');
})();
