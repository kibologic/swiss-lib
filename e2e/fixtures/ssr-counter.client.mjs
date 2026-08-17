/*
 * CROSS-001-B fixture: client-side half of the SSR round-trip conformance test.
 * Loaded via native <script type="module"> + import map (no bundler) -- exercises the
 * SAME browser-native ESM loading path the shipped product uses. Hydrates onto the
 * server-rendered markup and marks completion for Playwright to poll on.
 */
import { hydrate, jsx } from '@swissjs/core';
import { Counter } from './counter.component.mjs';

const container = document.getElementById('app');

// Tag the pre-hydration button so the test can assert node identity (no re-creation)
// across the hydrate() call.
const preHydrationButton = container.querySelector('button');
if (preHydrationButton) preHydrationButton.setAttribute('data-pre-hydration', 'true');

hydrate(jsx(Counter, { start: 3 }), container);

// Signal to the test harness that hydration has run (hydrate() itself is synchronous,
// but reactivity setup inside it may schedule a microtask -- see reactivity-setup.ts's
// queueMicrotask-coalesced commit path referenced in the harness's microtask suite).
queueMicrotask(() => {
  document.documentElement.setAttribute('data-hydrated', 'true');
});
