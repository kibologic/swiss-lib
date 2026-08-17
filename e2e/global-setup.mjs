/*
 * CROSS-001-B: runs once before the whole Playwright run (all projects share it, so
 * the compiled artifact truly is compiled once, per compiled-output-parity.spec.ts's
 * premise). Builds the compiled-.uix fixture via the real compiler pipeline.
 */
import { buildCompiledFixture } from './server/compile-fixtures.mjs';

export default async function globalSetup() {
  const outPath = await buildCompiledFixture();
  console.log(`[e2e global-setup] compiled fixture ready: ${outPath}`);
}
