// import * as path from 'path'; // Unused

/**
 * Handles import rewriting for .ui and .uix files and 1ui imports
 */
export function processImports(source: string, filePath: string): string {
  let processed = source;

  // Transform .uix imports to .tsx for build environments
  processed = processed.replace(
    /from\s+['"](\.\/[^'"]+)\.uix['"]/g,
    "from '$1.tsx'"
  );

  // Transform .ui imports to .tsx for build environments
  processed = processed.replace(
    /from\s+['"](\.\/[^'"]+)\.ui['"]/g,
    "from '$1.tsx'"
  );

  // Check for invalid imports
  if (/from\s+['"]1ui['"]/.test(processed)) {
    throw new Error(
      `Invalid import: '1ui' found in ${filePath}. JSX runtime should be imported from '@swissjs/core'.`,
    );
  }

  return processed;
}
