#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
/* global process */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const docsDir = path.join(root, 'docs');
const outputDir = path.join(root, 'docs-public');
const mode = process.argv.includes('--dry-run') ? 'dry-run' : 'build';

// Visibility markers and their handling
const visibilityMarkers = {
  // Internal content - completely removed from public docs
  internal: {
    patterns: [
      /@internal/gi,
      /<!-- @internal -->[\s\S]*?<!-- \/@internal -->/gi,
      /<!-- INTERNAL -->[\s\S]*?<!-- \/INTERNAL -->/gi,
      /\bInternal\b/gi,
      /\bDev[- ]?only\b/gi,
      /\bDO NOT PUBLISH\b/gi,
    ],
    action: 'remove'
  },
  
  // Development content - moved to internal docs
  development: {
    patterns: [
      /Phase \d+/gi,
      /development plan/gi,
      /roadmap/gi,
      /architecture deep[- ]?dive/gi,
      /\bPR\d+/gi,
      /commit flow/gi,
      /developer tools/gi,
      /CI\/CD/gi,
      /build pipeline/gi,
    ],
    action: 'move-to-internal'
  },
  
  // Sensitive content - redacted
  sensitive: {
    patterns: [
      /IP protection/gi,
      /proprietary/gi,
      /copyright notice/gi,
      /intellectual property/gi,
    ],
    action: 'redact'
  }
};

// Sections that should be completely excluded from public docs
const excludeSections = [
  'development/',
  'internal/',
  'tasks/',
  'aug-11/',
  'PHASE6_PLAN.md',
  'TECH_DEBT.md',
  'VERSIONING.md',
  'RELEASE_NOTES.md'
];

// Files that should be completely public
const alwaysPublic = [
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'guide/',
  'concepts/',
  'how-to/',
  'api/'
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && /\.(md|mdx)$/i.test(ent.name)) out.push(p);
  }
  return out;
}

function shouldExclude(filePath) {
  const relativePath = path.relative(docsDir, filePath);
  
  // Check if in exclude sections
  for (const exclude of excludeSections) {
    if (relativePath.startsWith(exclude)) return true;
  }
  
  return false;
}

function shouldAlwaysPublic(filePath) {
  const relativePath = path.relative(docsDir, filePath);
  
  for (const publicPath of alwaysPublic) {
    if (relativePath.startsWith(publicPath)) return true;
  }
  
  return false;
}

function processFile(inputPath, outputPath) {
  const original = fs.readFileSync(inputPath, 'utf8');
  let content = original;
  let hasInternal = false;
  let hasDevelopment = false;
  let hasSensitive = false;
  
  // Process each visibility marker
  for (const [type, config] of Object.entries(visibilityMarkers)) {
    for (const pattern of config.patterns) {
      if (pattern.test(content)) {
        switch (type) {
          case 'internal':
            hasInternal = true;
            if (config.action === 'remove') {
              content = content.replace(pattern, '');
            }
            break;
          case 'development':
            hasDevelopment = true;
            if (config.action === 'move-to-internal') {
              // Mark for moving to internal docs
              content = content.replace(pattern, (match) => {
                return `<!-- MOVED TO INTERNAL: ${match} -->`;
              });
            }
            break;
          case 'sensitive':
            hasSensitive = true;
            if (config.action === 'redact') {
              content = content.replace(pattern, '[REDACTED]');
            }
            break;
        }
      }
      pattern.lastIndex = 0; // reset regex
    }
  }
  
  // Clean up multiple empty lines
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Write output if not dry run
  if (mode === 'build' && content !== original) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
  }
  
  return {
    processed: content !== original,
    hasInternal,
    hasDevelopment,
    hasSensitive,
    originalLength: original.length,
    processedLength: content.length
  };
}

function generatePublicIndex() {
  const indexPath = path.join(outputDir, 'README.md');
  const content = `# SwissJS Framework Documentation

Welcome to the SwissJS Framework documentation. This is the public documentation for users and developers building applications with SwissJS.

## Getting Started

- [Installation Guide](./guide/installation.md)
- [Quick Start](./guide/quick-start.md)
- [Core Concepts](./concepts/)

## API Reference

- [Core API](./api/core/)
- [CLI Reference](./cli/)
- [Compiler API](./api/compiler/)

## Guides

- [Components](./guide/components.md)
- [Security](./guide/security.md)
- [Plugins](./guide/plugins.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to contribute to SwissJS.

## Security

See [SECURITY.md](./SECURITY.md) for security policies and vulnerability reporting.

---

*This documentation is automatically filtered from the internal documentation. Internal development details are not shown in this public version.*
`;
  
  if (mode === 'build') {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(indexPath, content, 'utf8');
  }
  
  return indexPath;
}

function main() {
  console.log(`[docs-visibility-filter] Running in ${mode} mode`);
  
  const files = walk(docsDir);
  const results = {
    total: files.length,
    excluded: 0,
    processed: 0,
    unchanged: 0,
    internal: 0,
    development: 0,
    sensitive: 0
  };
  
  for (const file of files) {
    const relativePath = path.relative(docsDir, file);
    
    if (shouldExclude(file)) {
      results.excluded++;
      console.log(`[exclude] ${relativePath}`);
      continue;
    }
    
    const outputPath = path.join(outputDir, relativePath);
    const result = processFile(file, outputPath);
    
    if (result.processed) {
      results.processed++;
      if (result.hasInternal) results.internal++;
      if (result.hasDevelopment) results.development++;
      if (result.hasSensitive) results.sensitive++;
      
      console.log(`[process] ${relativePath} (${result.originalLength} → ${result.processedLength} chars)`);
    } else {
      results.unchanged++;
      
      // Copy unchanged files
      if (mode === 'build' && !shouldAlwaysPublic(file)) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.copyFileSync(file, outputPath);
      }
    }
  }
  
  // Generate public index
  generatePublicIndex();
  
  console.log('\n[docs-visibility-filter] Summary:');
  console.log(`  Total files: ${results.total}`);
  console.log(`  Excluded: ${results.excluded}`);
  console.log(`  Processed: ${results.processed}`);
  console.log(`  Unchanged: ${results.unchanged}`);
  console.log(`  With internal content: ${results.internal}`);
  console.log(`  With development content: ${results.development}`);
  console.log(`  With sensitive content: ${results.sensitive}`);
  
  if (mode === 'dry-run') {
    console.log('\n[docs-visibility-filter] Dry run complete. Use --build to generate filtered docs.');
  } else {
    console.log(`\n[docs-visibility-filter] Public docs generated to: ${outputDir}`);
  }
}

main();
