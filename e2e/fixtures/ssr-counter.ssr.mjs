/*
 * CROSS-001-B fixture: server-side half of the SSR round-trip conformance test.
 * Mirrors runtime/src/__tests__/ssr-hydration-round-trip.test.ts's Counter component
 * exactly, so the same contract that is proven in jsdom is now also proven in real engines.
 */
import '@swissjs/core';
import { renderToString, jsx } from '@swissjs/core';
import { Counter } from './counter.component.mjs';

export function renderMarkup() {
  return renderToString(jsx(Counter, { start: 3 }));
}
