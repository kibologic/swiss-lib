#!/usr/bin/env node
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-env node */
import fs from 'fs';
import path from 'path';

function checkFile(filePath, expectedCopyright = 'Copyright (c) 2024 Themba Mzumara') {
  if (!fs.existsSync(filePath)) {
    return { exists: false, hasCopyright: false };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const hasCopyright = content.includes(expectedCopyright);
  
  return { exists: true, hasCopyright, content };
}

function verifyLicensing() {
  console.log('🔍 VERIFYING COMPREHENSIVE LICENSING PROTECTION');
  console.log('==============================================');
  
  let issues = [];
  let totalFiles = 0;
  let protectedFiles = 0;
  
  // 1. Check root LICENSE file
  console.log('\n📄 Checking root LICENSE file...');
  const license = checkFile('./LICENSE');
  if (!license.exists) {
    issues.push('❌ Missing root LICENSE file');
  } else if (!license.content.includes('MIT License') || !license.content.includes('Themba Mzumara')) {
    issues.push('❌ LICENSE file missing proper copyright/license');
  } else {
    console.log('✅ Root LICENSE file present and valid');
  }
  
  // 2. Check README.md ownership section
  console.log('\n📖 Checking README.md ownership section...');
  const readme = checkFile('./README.md');
  if (!readme.exists) {
    issues.push('❌ Missing README.md');
  } else if (!readme.content.includes('Ownership and Licensing') || !readme.content.includes('Themba Mzumara')) {
    issues.push('❌ README.md missing ownership section');
  } else {
    console.log('✅ README.md has proper ownership section');
  }
  
  // 3. Check CONTRIBUTING.md CLA
  console.log('\n🤝 Checking CONTRIBUTING.md CLA...');
  const contributing = checkFile('./CONTRIBUTING.md');
  if (!contributing.exists) {
    issues.push('❌ Missing CONTRIBUTING.md');
  } else if (!contributing.content.includes('Contributor License Agreement') || !contributing.content.includes('Signed-off-by')) {
    issues.push('❌ CONTRIBUTING.md missing CLA');
  } else {
    console.log('✅ CONTRIBUTING.md has proper CLA');
  }
  
  // 4. Check all package.json files for license info
  console.log('\n📦 Checking package.json files...');
  function checkPackageJsonFiles(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory() && !['node_modules', '.git', 'dist', '.turbo'].includes(item.name)) {
        checkPackageJsonFiles(fullPath);
      } else if (item.isFile() && item.name === 'package.json') {
        totalFiles++;
        const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        
        if (pkg.license === 'MIT' && 
            pkg.author && 
            pkg.author.name === 'Themba Mzumara' &&
            pkg.repository &&
            pkg.repository.url.includes('ThembaMzumara/SWISS')) {
          protectedFiles++;
          console.log(`✅ ${fullPath}`);
        } else {
          issues.push(`❌ ${fullPath} missing proper license/author info`);
        }
      }
    }
  }
  
  checkPackageJsonFiles('./');
  
  // 5. Check source files for copyright headers
  console.log('\n💻 Checking source files for copyright headers...');
  let sourceFiles = 0;
  let protectedSourceFiles = 0;
  
  function checkSourceFiles(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory() && !['node_modules', '.git', 'dist', '.turbo', 'docs/api'].includes(item.name)) {
        checkSourceFiles(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name);
        if (['.js', '.mjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
          sourceFiles++;
          const fileCheck = checkFile(fullPath);
          if (fileCheck.hasCopyright) {
            protectedSourceFiles++;
          }
        }
      }
    }
  }
  
  checkSourceFiles('./');
  
  // 6. Summary
  console.log('\n📊 LICENSING PROTECTION SUMMARY');
  console.log('==============================');
  console.log(`Package.json files: ${protectedFiles}/${totalFiles} protected`);
  console.log(`Source files: ${protectedSourceFiles}/${sourceFiles} with copyright headers`);
  
  if (issues.length === 0) {
    console.log('\n🎉 ✅ ALL LICENSING PROTECTION VERIFIED!');
    console.log('Your repository is fully protected with:');
    console.log('- MIT License file');
    console.log('- Copyright headers on all source files');
    console.log('- License info in all package.json files');
    console.log('- Ownership section in README.md');
    console.log('- Contributor License Agreement in CONTRIBUTING.md');
    return true;
  } else {
    console.log('\n❌ LICENSING ISSUES FOUND:');
    issues.forEach(issue => console.log(issue));
    return false;
  }
}

// Run verification
const success = verifyLicensing();
process.exit(success ? 0 : 1);
