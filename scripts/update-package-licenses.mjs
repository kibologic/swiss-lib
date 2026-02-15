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

function updatePackageJson(packagePath) {
  const content = fs.readFileSync(packagePath, 'utf8');
  const pkg = JSON.parse(content);
  
  // Add license information
  pkg.license = 'MIT';
  pkg.author = {
    name: 'Themba Mzumara',
    email: 'themba@swissjs.dev',
    url: 'https://github.com/ThembaMzumara'
  };
  
  // Add repository information
  pkg.repository = {
    type: 'git',
    url: 'git+https://github.com/ThembaMzumara/SWISS.git'
  };
  
  // Add homepage
  pkg.homepage = 'https://github.com/ThembaMzumara/SWISS#readme';
  
  // Add bugs URL
  pkg.bugs = {
    url: 'https://github.com/ThembaMzumara/SWISS/issues'
  };
  
  // Add copyright notice to keywords
  if (!pkg.keywords) {
    pkg.keywords = [];
  }
  if (!pkg.keywords.includes('swissjs')) {
    pkg.keywords.unshift('swissjs');
  }
  if (!pkg.keywords.includes('framework')) {
    pkg.keywords.push('framework');
  }
  
  // Write back with proper formatting
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ Updated ${packagePath}`);
}

function main() {
  console.log('📦 Updating package.json files with license information...');
  
  // Update root package.json
  updatePackageJson('./package.json');
  
  // Find all package.json files in packages/
  function findPackageJsonFiles(dir) {
    const files = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory() && item.name !== 'node_modules') {
        files.push(...findPackageJsonFiles(fullPath));
      } else if (item.isFile() && item.name === 'package.json') {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  // Update all package.json files in packages/
  const packageFiles = findPackageJsonFiles('./packages');
  packageFiles.forEach(updatePackageJson);
  
  // Update tools package.json if it exists
  const toolsPackage = './tools/docs-runner/package.json';
  if (fs.existsSync(toolsPackage)) {
    updatePackageJson(toolsPackage);
  }
  
  console.log(`🎉 Updated ${packageFiles.length + 2} package.json files!`);
}

main();
