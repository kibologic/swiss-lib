/*
 * CROSS-001-B fixture: server half for the focus-guard conformance test.
 * Renders a form with an input only (no error sibling yet) -- the client will focus it,
 * type into it, then trigger a re-render that inserts a sibling BEFORE the input, the
 * exact scenario covered by runtime/__tests__/regression/input-focus.test.ts in jsdom.
 * jsdom's document.activeElement is a bookkeeping flag, not real focus -- it does not
 * drive actual browser focus-ring, selection-range, or IME state. This fixture proves the
 * same contract holds under a real engine's focus/selection semantics.
 */
import '@swissjs/core';
import { renderToString, jsx } from '@swissjs/core';
import { FocusForm } from './focus-form.component.mjs';

export function renderMarkup() {
  return renderToString(jsx(FocusForm, { showError: false }));
}
