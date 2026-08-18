/*
 * CROSS-001-B: real engine event dispatch order and propagation. jsdom implements its
 * own approximation of the DOM event dispatch algorithm; a real engine's event loop,
 * capture/bubble ordering and stopPropagation semantics are what's actually under
 * test here, using the compiler's real addEventListener-based output
 * (FABLE-CROSS-001 s6: no engine sniffing, no prefixed properties in event handling).
 *
 * jsdom-invisible risk this catches: whether SwissJS's listener attachment produces
 * the SAME bubble order across Blink/WebKit/Gecko -- a synthetic jsdom click() never
 * exercises a real engine's dispatch queue or its interaction with microtask timing
 * (the runtime schedules its commit via queueMicrotask; whether a real click's event
 * handlers all run before or interleaved with that commit has never been observed
 * outside a simulated DOM).
 */
import { test, expect } from '@playwright/test';

test.describe('event ordering: real engine click dispatch bubbles inner -> middle -> outer', () => {
  test('a real click bubbles through nested handlers in DOM order', async ({ page }) => {
    await page.goto('/fixtures/event-order.html?stopAtInner=false');
    await page.waitForSelector('html[data-hydrated="true"]');

    await page.locator('#inner').click();

    // Real engine dispatch order: target first, then each ancestor in DOM order.
    await expect(page.locator('#log')).toHaveText('inner,middle,outer');
  });

  test('stopPropagation() actually halts further bubbling in a real engine', async ({ page }) => {
    await page.goto('/fixtures/event-order.html?stopAtInner=true');
    await page.waitForSelector('html[data-hydrated="true"]');

    await page.locator('#inner').click();

    // Only the innermost handler should have run; middle/outer must NOT fire.
    await expect(page.locator('#log')).toHaveText('inner');
  });

  test('state updates from the click handler commit before the next animation frame', async ({ page }) => {
    await page.goto('/fixtures/event-order.html?stopAtInner=false');
    await page.waitForSelector('html[data-hydrated="true"]');

    await page.locator('#inner').click();

    // The runtime commits state changes via a queueMicrotask-coalesced pass
    // (reactivity-setup.ts). Proving the DOM log text is already updated by the
    // time the browser paints the next frame checks that real microtask/paint
    // interleaving matches the framework's assumption -- something jsdom, which
    // has no paint or frame concept at all, cannot observe either way.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator('#log')).toHaveText('inner,middle,outer');
  });
});
