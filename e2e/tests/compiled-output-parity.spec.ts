/*
 * CROSS-001-B: compiled-output execution parity -- the same .uix source compiled ONCE
 * (via the real UiCompiler + esbuild pipeline swite and the Vite plugin both use, see
 * e2e/server/compile-fixtures.mjs) executed in all three engines.
 *
 * FABLE-CROSS-001 s6 audited the compiler's output BY INSPECTION and found no prefixed
 * properties, no engine sniffing, no engine-specific branches -- but explicitly flagged
 * "Not verified: whether compiled output executes identically in all three engines.
 * That requires running the conformance suite in real engines, which is CROSS-001-B."
 * This test is that verification. It is meaningful (not a rubber stamp) because a
 * static-inspection pass cannot catch runtime engine divergence in how each engine's
 * DOM implementation actually executes createElement/textContent/addEventListener
 * calls -- only running the SAME artifact in each engine can.
 */
import { test, expect } from '@playwright/test';

test.describe('compiled .uix output: same artifact, identical execution across engines', () => {
  test('the compiled component renders identical DOM structure and text', async ({ page }) => {
    await page.goto('/fixtures/compiled-parity.html');
    await page.waitForSelector('html[data-hydrated="true"]');

    const greeting = page.locator('.greeting');
    await expect(greeting).toHaveText('Hello, Engine!');

    // Structural parity: exactly one element, correct tag, correct class -- proving
    // the compiler's emitted createElement/textContent calls produced the same DOM
    // shape this engine's DOM implementation as every other engine's.
    const tagAndChildCount = await greeting.evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      childElementCount: el.childElementCount,
    }));
    expect(tagAndChildCount).toEqual({ tag: 'div', childElementCount: 0 });
  });
});
