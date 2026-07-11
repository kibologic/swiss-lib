// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression / gap-documentation suite: null-child slot collapse & list reorder.
 *
 * FABLE-FRAME-001 (registry/fable/framework/FABLE-FRAME-001-index-derived-child-identity.md)
 * identifies index-derived child identity as the root cause of a bug class.
 * input-focus.test.ts already covers and pins the sibling-insertion/focus case
 * (fixed 2026-06-30 via a type-based reconciler fallback). This file covers
 * the two remaining failure modes the report describes that had NO dedicated
 * runtime test before this file: a `null`/`false` child collapsing its slot
 * and shifting sibling indices, and list-reorder (does the reconciler MOVE
 * existing nodes, or recreate them, when order changes).
 *
 * Also covers a third failure mode: a conditional multi-child `<>...</>`
 * fragment sibling ("Fragment child reorder" in the report).
 *
 * Tests that pass document behavior that is ALREADY correct today (often via
 * the same type-based fallback that fixed input-focus). Tests marked
 * `.fails()` document a real, currently-unfixed gap per FABLE-FRAME-001 --
 * vitest will error loudly if one of these ever starts passing unexpectedly,
 * which is the signal that the underlying compiler/runtime fix has landed
 * and the `.fails()` marker (and the corresponding FRAME-001 tracking) should
 * be removed.
 */

import { describe, it, expect } from 'vitest';
import { createElement as h, Fragment } from '../../src/vdom/vdom.js';
import { renderToDOM } from '../../src/renderer/renderer.js';

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root-2');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root-2';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

describe('null-child slot collapse', () => {
  it('preserves a focused input after the sibling BEFORE it flips from null to a real element', () => {
    const container = getContainer();

    // Initial: [null, input] -- the leading slot is empty (conditional not shown yet).
    renderToDOM(
      h('form', {}, null, h('input', { type: 'text', name: 'q', value: '' })),
      container,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Conditional becomes true: [div, input] -- input's true position doesn't move,
    // but its runtime index among non-null children does shift if null didn't
    // reserve a slot.
    renderToDOM(
      h('form', {}, h('div', { class: 'banner' }, 'Notice'), h('input', { type: 'text', name: 'q', value: '' })),
      container,
    );

    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('preserves identity of the LAST of three siblings when the middle one toggles null -> element -> null', () => {
    const container = getContainer();

    renderToDOM(
      h('div', {},
        h('span', { id: 'first' }, 'first'),
        null,
        h('input', { type: 'text', name: 'last', value: '' }),
      ),
      container,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Middle slot becomes a real element.
    renderToDOM(
      h('div', {},
        h('span', { id: 'first' }, 'first'),
        h('div', { class: 'middle' }, 'middle'),
        h('input', { type: 'text', name: 'last', value: '' }),
      ),
      container,
    );
    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);

    // Middle slot collapses back to null.
    renderToDOM(
      h('div', {},
        h('span', { id: 'first' }, 'first'),
        null,
        h('input', { type: 'text', name: 'last', value: '' }),
      ),
      container,
    );
    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });
});

describe('list reorder', () => {
  it('MOVES existing DOM nodes (not recreate) when a keyed list is reversed', () => {
    const container = getContainer();

    renderToDOM(
      h('ul', {},
        h('li', { key: 'a' }, 'A'),
        h('li', { key: 'b' }, 'B'),
        h('li', { key: 'c' }, 'C'),
      ),
      container,
    );
    const liA = container.querySelectorAll('li')[0];
    const liB = container.querySelectorAll('li')[1];
    const liC = container.querySelectorAll('li')[2];

    renderToDOM(
      h('ul', {},
        h('li', { key: 'c' }, 'C'),
        h('li', { key: 'b' }, 'B'),
        h('li', { key: 'a' }, 'A'),
      ),
      container,
    );

    const after = Array.from(container.querySelectorAll('li'));
    expect(after).toEqual([liC, liB, liA]); // same DOM nodes, new order -- moved, not recreated
    expect(after.map((n) => n.textContent)).toEqual(['C', 'B', 'A']);
  });

  // KNOWN GAP (FABLE-FRAME-001): verified currently broken by running this
  // exact case -- when three unkeyed siblings share the SAME wrapper type
  // ("div"), the type-based fallback cannot tell which old div-with-input
  // corresponds to which new position, and the input is lost (removed from
  // the DOM) rather than moved. This is the "matching a same-type sibling"
  // risk the report's Architectural Impact section calls out. If this ever
  // starts passing, the compile-time stable-key fix (FRAME-001 solution #1)
  // has landed -- remove `.fails()` and update the tracking doc.
  it.fails('preserves a focused input inside a reordered UNKEYED list item (no explicit key)', () => {
    // Same reorder as above but WITHOUT explicit keys -- this is the realistic
    // case for most app code today, and the one FABLE-FRAME-001 says is fragile.
    const container = getContainer();

    renderToDOM(
      h('div', {},
        h('div', {}, 'Item A'),
        h('div', {}, h('input', { type: 'text', name: 'b-input', value: '' })),
        h('div', {}, 'Item C'),
      ),
      container,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Reverse order: the input's wrapping div moves from index 1 to index 1
    // (middle stays middle when reversing 3 items) -- use a rotation instead,
    // which actually changes its index (1 -> 2), to exercise identity-by-index.
    renderToDOM(
      h('div', {},
        h('div', {}, 'Item A'),
        h('div', {}, 'Item C'),
        h('div', {}, h('input', { type: 'text', name: 'b-input', value: '' })),
      ),
      container,
    );

    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });
});

describe('fragment child reorder', () => {
  it('preserves a focused input in a trailing sibling when a conditional multi-child fragment appears before it', () => {
    const container = getContainer();

    // Conditional fragment absent: [input]
    renderToDOM(
      h('form', {}, h('input', { type: 'text', name: 'q', value: '' })),
      container,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Conditional fragment appears BEFORE the input: [<>X Y</>, input]
    renderToDOM(
      h('form', {},
        h(Fragment, {}, h('span', {}, 'X'), h('span', {}, 'Y')),
        h('input', { type: 'text', name: 'q', value: '' }),
      ),
      container,
    );

    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("preserves the internal order of a fragment's own children across a re-render", () => {
    const container = getContainer();

    renderToDOM(
      h('div', {}, h(Fragment, {}, h('span', { id: 'x' }, 'X'), h('span', { id: 'y' }, 'Y'))),
      container,
    );
    const before = Array.from(container.querySelectorAll('span')).map((n) => n.id);
    expect(before).toEqual(['x', 'y']);

    // Re-render with an unrelated prop change elsewhere -- fragment content unchanged.
    renderToDOM(
      h('div', { 'data-updated': 'true' }, h(Fragment, {}, h('span', { id: 'x' }, 'X'), h('span', { id: 'y' }, 'Y'))),
      container,
    );
    const after = Array.from(container.querySelectorAll('span')).map((n) => n.id);
    expect(after).toEqual(['x', 'y']);
  });
});
