/**
 * Handles import rewriting for .ui and .uix files and 1ui imports
 */
export function processImports(source: string, filePath: string): string {
  const processed = source;

  // .uix/.ui import specifiers used to be rewritten to .tsx here, supposedly
  // "for esbuild's JSX pipeline" -- verified empirically that esbuild's
  // transform() doesn't resolve imports at all and is indifferent to the
  // extension inside an import specifier, so that rewrite did nothing useful
  // for esbuild. What it did do: emit import specifiers pointing at files
  // that don't exist on disk (no .tsx file is ever actually written), which
  // every real bundler consuming compiled output has to work around --
  // swite's own import-rewriter carries an on-disk-existence-check
  // specifically labeled "Fix compiler bug: .uix/.ui imports emitted as .js
  // or .tsx" (src/resolution/rewriting/import-rewriter.ts). Leaving .ui/.uix
  // import specifiers untouched is the actual fix: real bundlers (swite,
  // Vite via @swissjs/vite-plugin) resolve .ui/.uix directly since they
  // already know that extension, and swite's workaround stays safe/inert
  // for this case (it still independently handles genuine .js-suffixed
  // TS-style imports, which was never specific to this rewrite).

  // Check for invalid imports
  if (/from\s+['"]1ui['"]/.test(processed)) {
    throw new Error(
      `Invalid import: '1ui' found in ${filePath}. JSX runtime should be imported from '@swissjs/core'.`,
    );
  }

  return processed;
}
