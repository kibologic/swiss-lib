/*
 * CROSS-001-B fixture: client-side half of the focus-guard conformance test.
 * Hydrates the server-rendered form, then exposes nothing extra -- the test drives
 * focus/typing/clicking directly through Playwright's real input APIs (page.focus,
 * page.keyboard.type, page.click), which dispatch genuine engine-level focus and
 * input events jsdom cannot produce.
 */
import { hydrate, jsx } from '@swissjs/core';
import { FocusForm } from './focus-form.component.mjs';

const container = document.getElementById('app');
hydrate(jsx(FocusForm, { showError: false }), container);

queueMicrotask(() => {
  document.documentElement.setAttribute('data-hydrated', 'true');
});
