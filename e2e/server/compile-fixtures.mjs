/*
 * CROSS-001-B: compiled-output execution parity fixture build step.
 *
 * Compiles e2e/fixtures/Greeting.uix through the REAL production pipeline -- the exact
 * two-step UiCompiler.compileAsync() + esbuild-transform-to-ESM sequence swite's
 * base-handler.ts and the Vite plugin both use (mirrored 1:1 from
 * plugins/vite/__tests__/parity.test.ts's compileLikeSwite()) -- ONCE, ahead of time.
 * The SAME emitted JS file is then loaded by all three Playwright engine projects, so the
 * conformance test is proving execution parity of one compiled artifact, not
 * re-compiling per engine (which would prove nothing about the artifact itself).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UiCompiler } from '@swissjs/compiler';
import { transform as esbuildTransform } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

async function compileLikeProduction(source, filePath) {
  const compiler = new UiCompiler();
  const compiled = await compiler.compileAsync(source, filePath);
  const result = await esbuildTransform(compiled, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext',
    sourcefile: filePath,
    sourcemap: false,
  });
  return result.code;
}

export async function buildCompiledFixture() {
  const srcPath = path.join(FIXTURES_DIR, 'Greeting.uix');
  const outPath = path.join(FIXTURES_DIR, 'Greeting.compiled.js');
  const source = await readFile(srcPath, 'utf-8');
  const compiled = await compileLikeProduction(source, srcPath);
  await writeFile(outPath, compiled, 'utf-8');
  return outPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildCompiledFixture().then((outPath) => {
    console.log(`[e2e] compiled fixture written: ${outPath}`);
  });
}
