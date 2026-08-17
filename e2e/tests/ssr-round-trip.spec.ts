/*
 * CROSS-001-B: SSR round-trip in a real engine. Mirrors
 * runtime/src/__tests__/ssr-hydration-round-trip.test.ts's jsdom "reuses the existing
 * DOM node" case, but here the server HTML is served over real HTTP, parsed by the
 * engine's real HTML parser (not jsdom's), and hydrated in a real DOM -- proving no
 * re-creation and restored interactivity under an engine users actually ship to.
 *
 * jsdom-invisible risk this catches: jsdom's innerHTML parsing and DOM node identity
 * bookkeeping are jsdom's own approximation of the HTML spec, not the engine's real
 * parser/tree-builder. A node-identity claim ("hydrate reused the same node") proven
 * only in jsdom has never been checked against a real parser's actual node graph.
 */
import { test, expect } from '@playwright/test';

test.describe('SSR round trip: renderToString served -> hydrate() in a real engine', () => {
  test('server markup renders correctly before any JS runs', async ({ page }) => {
    // Block the client module so we can inspect PURE server-rendered markup --
    // proves renderToString's output is valid, engine-parseable HTML on its own,
    // independent of hydration succeeding.
    await page.route('**/fixtures/client/ssr-counter.client.mjs', (route) => route.abort());
    await page.goto('/fixtures/ssr-counter.html');

    const button = page.locator('button.counter');
    await expect(button).toHaveText('count: 3');
  });

  test('hydrate() reuses the server-rendered DOM node (no re-creation) and restores interactivity', async ({ page }) => {
    await page.goto('/fixtures/ssr-counter.html');

    // Wait for hydration to complete (flagged by the client fixture after its
    // queueMicrotask-scheduled setup runs).
    await page.waitForSelector('html[data-hydrated="true"]');

    const button = page.locator('button.counter');
    await expect(button).toHaveText('count: 3');

    // NO RE-CREATION: the button hydrate() attaches behaviour to must be the exact
    // DOM node the server's HTML produced, not a replacement -- verified via the
    // data-pre-hydration marker the client fixture stamps onto it before calling
    // hydrate(). A real engine's node identity (not jsdom's) is what's under test.
    await expect(button).toHaveAttribute('data-pre-hydration', 'true');

    // Interactivity restored: renderToString explicitly does not serialize "on*"
    // props, so this click only works if hydrate() actually attached a live listener.
    await button.click();
    await expect(button).toHaveText('count: 4');

    // A second click proves it isn't a one-shot fluke of event delegation setup.
    await button.click();
    await expect(button).toHaveText('count: 5');
  });
});
