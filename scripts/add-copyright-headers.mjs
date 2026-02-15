#!/usr/bin/env node
/* eslint-env node */
/* global process */
import fs from 'fs';
import path from 'path';

const COPYRIGHT_HEADER_JS = `/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

`;

const COPYRIGHT_HEADER_TS = `/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

`;

const COPYRIGHT_HEADER_MD = `<!--
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

`;

function hasExistingCopyright(content) {
  return content.includes('Copyright (c)') || content.includes('Licensed under');
}

function addCopyrightHeader(filePath, header) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (hasExistingCopyright(content)) {
    console.log(`⏭️  Skipping ${filePath} (already has copyright)`);
    return false;
  }
  
  // Handle shebang lines
  let newContent;
  if (content.startsWith('#!')) {
    const lines = content.split('\n');
    const shebang = lines[0];
    const rest = lines.slice(1).join('\n');
    newContent = shebang + '\n' + header + rest;
  } else {
    newContent = header + content;
  }
  
  fs.writeFileSync(filePath, newContent);
  console.log(`✅ Added copyright to ${filePath}`);
  return true;
}

function processDirectory(dir, extensions) {
  let count = 0;
  
  function walkDir(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      
      if (item.isDirectory()) {
        // Skip node_modules, .git, dist, etc.
        if (!['node_modules', '.git', 'dist', '.turbo', 'docs/api'].includes(item.name)) {
          walkDir(fullPath);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (extensions.includes(ext)) {
          let header;
          if (['.js', '.mjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
            header = ext === '.ts' || ext === '.tsx' ? COPYRIGHT_HEADER_TS : COPYRIGHT_HEADER_JS;
          } else if (ext === '.md') {
            header = COPYRIGHT_HEADER_MD;
          }
          
          if (header && addCopyrightHeader(fullPath, header)) {
            count++;
          }
        }
      }
    }
  }
  
  walkDir(dir);
  return count;
}

function main() {
  console.log('🔒 Adding copyright headers to SwissJS Framework files...');
  
  const sourceExtensions = ['.js', '.mjs', '.ts', '.tsx', '.jsx'];
  const docExtensions = ['.md'];
  
  let totalCount = 0;
  
  // Process source files
  console.log('\n📁 Processing source files...');
  totalCount += processDirectory('.', sourceExtensions);
  
  // Process documentation files
  console.log('\n📚 Processing documentation files...');
  totalCount += processDirectory('.', docExtensions);
  
  console.log(`\n🎉 Added copyright headers to ${totalCount} files!`);
}

main();
