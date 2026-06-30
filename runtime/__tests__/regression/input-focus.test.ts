// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression Suite: Input Focus Preservation
 *
 * Every case here documents a real failure mode. Each test must pass on every
 * release. A new failing case means the framework needs a fix, not the test.
 *
 * Root cause (fixed 2026-06-30): reconcileChildren had a type-based fallback
 * for unkeyed COMPONENT VNodes when conditional siblings shifted their index,
 * but no equivalent for ELEMENT VNodes. When a conditional <div> was inserted
 * before an <input>, the input key changed from `input_0` to `input_1`, no
 * old entry was found, a fresh <input> was created, and the focused one was
 * removed — destroying focus on the first keystroke.
 *
 * Secondary issue (fixed 2026-06-30): updateProperty called element.focus()
 * on every value prop update as a workaround, which triggered spurious
 * blur/focus cycles. Removed once the reconciler fix was in place.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createElement as h } from '../../src/vdom/vdom.js';
import { renderToDOM } from '../../src/renderer/renderer.js';
import { reconcileChildren } from '../../src/renderer/reconciliation.js';
import type { VNode } from '../../src/vdom/vdom.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

// Minimal stubs for reconcileChildren's injected function params
const noopUpdate = (_dom: Node, _vnode: VNode) => { /* no-op */ };
function makeCreate(tag?: string) {
  return (vnode: VNode | null | undefined | boolean): Node => {
    const t = (vnode && typeof vnode === 'object' && 'type' in vnode && typeof (vnode as any).type === 'string')
      ? (vnode as any).type
      : tag ?? 'span';
    const el = document.createElement(t);
    if (vnode && typeof vnode === 'object') (vnode as any).dom = el;
    return el;
  };
}

// ─── Suite 1: reconciler type-based element fallback ─────────────────────────

describe('reconcileChildren — type-based fallback for element VNodes', () => {

  it('preserves existing <input> DOM node when a sibling is inserted before it', () => {
    const parent = document.createElement('form');
    document.body.appendChild(parent);

    // Initial render: just the input
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.name = 'search';
    parent.appendChild(inputEl);

    const oldInputVNode = h('input', { type: 'text', name: 'search' });
    (oldInputVNode as any).dom = inputEl;
    const oldChildren = [oldInputVNode] as VNode[];

    // After state change: conditional error div inserted BEFORE the input
    const newErrorVNode = h('div', { class: 'error' }, 'Required') as VNode;
    const newInputVNode = h('input', { type: 'text', name: 'search' }) as VNode;
    const newChildren = [newErrorVNode, newInputVNode];

    const removed: Node[] = [];
    const origRemove = parent.removeChild.bind(parent);
    (parent as any).removeChild = (n: Node) => { removed.push(n); return origRemove(n); };

    reconcileChildren(parent, oldChildren, newChildren, noopUpdate, makeCreate());

    document.body.removeChild(parent);

    // Original <input> must NOT have been destroyed
    expect(removed).not.toContain(inputEl);
    // New input VNode must reference the preserved DOM node
    expect((newInputVNode as any).dom).toBe(inputEl);
  });

  it('does not destroy the focused input when its index shifts from 0 to 1', () => {
    const parent = document.createElement('form');
    document.body.appendChild(parent);

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.name = 'email';
    parent.appendChild(inputEl);
    inputEl.focus();

    const oldInputVNode = h('input', { type: 'text', name: 'email' }) as VNode;
    (oldInputVNode as any).dom = inputEl;

    // Error div appears, shifting input from index 0 → 1
    const newErrorVNode = h('div', { class: 'field-error' }, 'Invalid') as VNode;
    const newInputVNode = h('input', { type: 'text', name: 'email' }) as VNode;

    const destroyed: Node[] = [];
    const origRemove = parent.removeChild.bind(parent);
    (parent as any).removeChild = (n: Node) => { destroyed.push(n); return origRemove(n); };

    reconcileChildren(parent, [oldInputVNode], [newErrorVNode, newInputVNode], noopUpdate, makeCreate());

    document.body.removeChild(parent);

    expect(destroyed).not.toContain(inputEl);
    expect((newInputVNode as any).dom).toBe(inputEl);
  });

  it('handles multiple elements of the same type shifting together', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const input1 = document.createElement('input'); input1.name = 'a'; parent.appendChild(input1);
    const input2 = document.createElement('input'); input2.name = 'b'; parent.appendChild(input2);

    const oldVNode1 = h('input', { name: 'a' }) as VNode; (oldVNode1 as any).dom = input1;
    const oldVNode2 = h('input', { name: 'b' }) as VNode; (oldVNode2 as any).dom = input2;

    // Header inserted before both inputs
    const header = h('h2', {}, 'Form') as VNode;
    const newVNode1 = h('input', { name: 'a' }) as VNode;
    const newVNode2 = h('input', { name: 'b' }) as VNode;

    const destroyed: Node[] = [];
    const origRemove = parent.removeChild.bind(parent);
    (parent as any).removeChild = (n: Node) => { destroyed.push(n); return origRemove(n); };

    reconcileChildren(parent, [oldVNode1, oldVNode2], [header, newVNode1, newVNode2], noopUpdate, makeCreate());

    document.body.removeChild(parent);

    expect(destroyed).not.toContain(input1);
    expect(destroyed).not.toContain(input2);
  });
});

// ─── Suite 2: updateProperty no spurious focus() ─────────────────────────────

describe('updateProperty — value update does not trigger blur/focus cycle', () => {

  it('re-rendering with a new value prop fires no blur event on the focused input', () => {
    const container = getContainer();

    renderToDOM(h('div', {}, h('input', { type: 'text', name: 'q', value: '' })), container);

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();

    const events: string[] = [];
    input.addEventListener('blur', () => events.push('blur'));
    input.addEventListener('focus', () => events.push('focus'));
    input.focus();
    events.length = 0;

    // Re-render with updated value
    renderToDOM(h('div', {}, h('input', { type: 'text', name: 'q', value: 'h' })), container);

    expect(events).not.toContain('blur');
  });
});

// ─── Suite 3: end-to-end focus preservation through renderToDOM ───────────────

describe('renderToDOM — focus preserved across reactive updates', () => {

  beforeEach(() => { getContainer(); }); // resets the container

  it('preserves focus when re-rendering with updated value prop', () => {
    const container = getContainer();

    renderToDOM(h('form', {}, h('input', { type: 'text', name: 'search', value: '' })), container);

    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    renderToDOM(h('form', {}, h('input', { type: 'text', name: 'search', value: 'h' })), container);

    expect(document.activeElement).toBe(input);
  });

  it('preserves focus when a conditional sibling is inserted before the input', () => {
    const container = getContainer();

    renderToDOM(
      h('form', {}, h('input', { type: 'text', name: 'email', value: '' })),
      container,
    );

    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Error div appears BEFORE the input
    renderToDOM(
      h('form', {},
        h('div', { class: 'error' }, 'Required'),
        h('input', { type: 'text', name: 'email', value: '' }),
      ),
      container,
    );

    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('preserves cursor position through rapid value updates (simulated keystrokes)', () => {
    const container = getContainer();

    renderToDOM(h('div', {}, h('input', { type: 'text', name: 'q', value: '' })), container);
    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();

    for (const val of ['a', 'ab', 'abc']) {
      input.value = val;
      renderToDOM(h('div', {}, h('input', { type: 'text', name: 'q', value: val })), container);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe(val);
    }
  });

  it('preserves focus on textarea under the same conditions', () => {
    const container = getContainer();

    renderToDOM(h('div', {}, h('textarea', { name: 'notes' })), container);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    ta.focus();
    expect(document.activeElement).toBe(ta);

    renderToDOM(h('div', {}, h('textarea', { name: 'notes', value: 'hello' })), container);
    expect(document.activeElement).toBe(ta);
  });

  it('preserves focus when sibling removal shifts input back to index 0', () => {
    const container = getContainer();

    // Start with error + input
    renderToDOM(
      h('form', {},
        h('div', { class: 'error' }, 'Required'),
        h('input', { type: 'text', name: 'email', value: '' }),
      ),
      container,
    );

    const input = container.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Error cleared — input moves back to index 0
    renderToDOM(
      h('form', {}, h('input', { type: 'text', name: 'email', value: '' })),
      container,
    );

    expect(document.contains(input)).toBe(true);
    expect(document.activeElement).toBe(input);
  });
});
