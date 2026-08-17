/*
 * CROSS-001-B: focus save/restore across a reconciliation commit, in a real engine.
 * Mirrors runtime/__tests__/regression/input-focus.test.ts's "conditional sibling
 * inserted before the input" case -- but here focus, typing and selection are driven
 * by Playwright's real input APIs, which dispatch genuine engine focus/input events.
 *
 * jsdom-invisible risk this catches: jsdom's document.activeElement is bookkeeping
 * updated by calling .focus() -- it does not model a real focus ring, does not fire
 * every event a real engine fires on blur/focus, and has no concept of selection
 * range interacting with real text-editing. A framework claim of "focus survives
 * reconciliation" proven only against jsdom's approximation has never been checked
 * against what an engine's actual focus manager does when a DOM node is detached
 * and a new one takes its place mid-keystroke.
 *
 * A SECOND jsdom-invisible finding surfaced while building this fixture, worth
 * recording explicitly: the reconciliation here is triggered by typing (an `input`
 * event on the field itself), not by a separate button click. A button click was the
 * first design, and it failed consistently in all three real engines -- not because
 * focus-guard is broken, but because clicking a <button> in a real engine moves
 * focus to the button as part of the click, BEFORE the click handler's state
 * mutation runs. jsdom's synthetic .click() does not reproduce that focus shift, so
 * a jsdom-only version of "click a button, assert the input kept focus" would have
 * silently passed for the wrong reason. See focus-form.component.mjs's header for
 * the full account. This is exactly the class of gap FABLE-CROSS-001 predicted.
 */
import { test, expect } from '@playwright/test';

test.describe('focus-guard: real engine focus/selection survives a reconciliation commit', () => {
  test('typed text and cursor position survive a validation error appearing while still typing', async ({ page }) => {
    await page.goto('/fixtures/focus-guard.html');
    await page.waitForSelector('html[data-hydrated="true"]');

    const input = page.locator('#email-input');
    await input.click();
    await input.type('hello@example.com');
    await expect(input).toHaveValue('hello@example.com');
    await expect(input).toBeFocused();

    // Move the caret to a known position (real engine selection API -- jsdom's
    // setSelectionRange does not interact with any real caret rendering).
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(5, 5));

    // Type "bad" -- the fixture's onInput handler flips state.showError to true,
    // triggering a re-render that inserts a <div class="field-error"> BEFORE the
    // input mid-keystroke. This is the exact reconciliation shape
    // input-focus.test.ts covers in jsdom, but here the state change and the DOM
    // mutation both happen while the input is the real, engine-tracked active
    // element -- not merely jsdom's activeElement bookkeeping.
    await page.keyboard.type('bad');
    await expect(page.locator('#field-error')).toHaveText('Required');

    // FOCUS MUST SURVIVE: this is the framework's focus-guard contract
    // (runtime/src/component/focus-guard.ts saveFocusState/restoreFocusState),
    // now proven against a real engine's own focus manager, not jsdom's.
    await expect(input).toBeFocused();
    // Cursor was at position 5 ("hello|@example.com") before typing "bad" -- a real
    // engine inserts at the live caret position, proving the caret survived the
    // reconciliation too, not just raw focus.
    await expect(input).toHaveValue('hellobad@example.com');

    // Prove focus is still LIVE, not merely flagged: further real typing continues
    // to land in the same input at the current caret position.
    await page.keyboard.type('X');
    await expect(input).toHaveValue('hellobadX@example.com');
  });

  test('input DOM node identity is preserved across a reconciliation triggered by an unrelated control (button click)', async ({ page }) => {
    await page.goto('/fixtures/focus-guard.html');
    await page.waitForSelector('html[data-hydrated="true"]');

    await page.locator('#email-input').evaluate((el) => el.setAttribute('data-instance', 'original'));

    // Deliberately a DIFFERENT scenario from the test above: here the reconciliation
    // is triggered by clicking #toggle-error, a real focus-moving action in every
    // engine (see this file's header note). This test does NOT assert the input
    // keeps focus -- it asserts DOM node identity survives regardless of where
    // focus ends up, which is the narrower, still-true claim.
    await page.locator('#toggle-error').click();
    await expect(page.locator('#field-error')).toHaveText('Required');

    // If the reconciler had destroyed and recreated the input (rather than
    // reusing the DOM node), this custom marker attribute -- which the framework
    // never sets and never clears -- would have been lost.
    await expect(page.locator('#email-input')).toHaveAttribute('data-instance', 'original');
  });
});
