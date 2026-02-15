#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Build-time version injection script
 * 
 * Replaces __SWISS_VERSION__ placeholder in compiled JavaScript files
 * with the actual version from package.json.
 * 
 * This ensures the version is available at runtime for error reporting
 * and debugging.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

// Find all .js files in dist directory
const distDir = path.resolve(__dirname, '../dist');

function replaceVersionInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const replaced = content.replace(/__SWISS_VERSION__/g, JSON.stringify(version));
  
  if (content !== replaced) {
    fs.writeFileSync(filePath, replaced, 'utf-8');
    console.log(`✓ Injected version ${version} into ${path.relative(distDir, filePath)}`);
  }
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      replaceVersionInFile(fullPath);
    }
  }
}

if (fs.existsSync(distDir)) {
  console.log(`Injecting version ${version} into compiled files...`);
  processDirectory(distDir);
  console.log('Version injection complete.');
} else {
  console.warn(`Dist directory not found: ${distDir}`);
  console.warn('Version injection skipped. Run build first.');
  process.exit(0);
}
