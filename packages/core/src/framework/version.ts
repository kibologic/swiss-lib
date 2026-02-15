/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * SwissJS Framework Version
 * 
 * This version is injected at build time from package.json.
 * The placeholder '__SWISS_VERSION__' is replaced during the build process.
 * 
 * In development, this will show 'dev' or the actual version from package.json.
 * In production builds, this is replaced with the actual version string.
 * 
 * Usage:
 * ```typescript
 * import { SWISS_VERSION } from '@swissjs/core';
 * console.log(`Running SwissJS ${SWISS_VERSION}`);
 * ```
 * 
 * This allows users to report bugs with version information:
 * "I'm using SwissJS 1.2.0 and experiencing..."
 */
export const SWISS_VERSION: string = 
  typeof __SWISS_VERSION__ !== 'undefined' 
    ? __SWISS_VERSION__ 
    : (typeof process !== 'undefined' && process.env?.npm_package_version) || '0.1.0-dev';

// Type declaration for build-time replacement
declare const __SWISS_VERSION__: string;
