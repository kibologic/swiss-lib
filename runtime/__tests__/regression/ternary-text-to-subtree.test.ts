// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression: FRAME-WA-005 — a ternary swapping a text node for a deep,
 * method-generated subtree never patches the DOM.
 *
 * Symptom (Nostromo, real browser, 2026-08-14): `cond ? <text> : <richSubtree>`
 * inside a wrapper element. The text branch renders. Editing state so the
 * condition flips to the subtree branch computes a correct new vnode tree,
 * but the DOM never updates — it stays on the text branch permanently, even
 * across further unrelated state changes.
 *
 * This exercises renderToDOM end-to-end (the same entry point a component's
 * reactive re-render uses), not just reconcileChildren in isolation, because
 * the discriminating observation in the task is that a text->text swap in
 * the SAME component patches correctly while text->subtree does not — so
 * the repro needs the full updateElementNode -> reconcileChildren pipeline.
 */

import { describe, it, expect } from 'vitest';
import { createElement as h } from '../../src/vdom/vdom.js';
import { renderToDOM } from '../../src/renderer/renderer.js';

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root-wa005');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root-wa005';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

// Mirrors the reported shape: a wrapper whose single child is a ternary
// choosing between a placeholder text string and a deep, multi-level
// "method-generated" subtree (analogous to previewJob(...) building a
// preview panel).
function renderPanel(hasResult: boolean) {
  return h(
    'div',
    { class: 'panel' },
    hasResult
      ? h('div', { class: 'result' },
          h('img', { class: 'thumb', src: 'x.png' }),
          h('span', { class: 'caption' }, 'golden-512x341.jpg loaded (512x341px)'),
        )
      : 'Choose an image to see a live preview.',
  );
}

describe('FRAME-WA-005 — ternary text-to-subtree swap', () => {
  it('patches the DOM when the branch flips from text to a rich subtree', () => {
    const container = getContainer();

    renderToDOM(renderPanel(false), container);
    const panel = container.querySelector('.panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain('Choose an image');
    expect(panel.querySelector('.result')).toBeNull();

    // State flips: hasResult becomes true, a real re-render is issued via renderToDOM
    // against the SAME container, exactly as a component's reactive update would.
    renderToDOM(renderPanel(true), container);

    const resultAfter = container.querySelector('.result');
    expect(resultAfter).not.toBeNull();
    expect(container.querySelector('.thumb')).not.toBeNull();
    expect(container.textContent).not.toContain('Choose an image');
  });

  it('patches the DOM when the branch flips back from subtree to text', () => {
    const container = getContainer();

    renderToDOM(renderPanel(true), container);
    expect(container.querySelector('.result')).not.toBeNull();

    renderToDOM(renderPanel(false), container);

    expect(container.querySelector('.result')).toBeNull();
    expect(container.textContent).toContain('Choose an image');
  });

  it('recovers even after repeated unrelated re-renders while stuck (does not require exactly one extra render to catch up)', () => {
    const container = getContainer();

    renderToDOM(renderPanel(false), container);
    // Simulate "editing unrelated state twice more" per the task's own symptom description --
    // re-render the SAME (false) branch twice before flipping, to rule out a one-render-behind
    // staleness rather than a permanent stuck state.
    renderToDOM(renderPanel(false), container);
    renderToDOM(renderPanel(false), container);

    renderToDOM(renderPanel(true), container);

    expect(container.querySelector('.result')).not.toBeNull();
    expect(container.textContent).not.toContain('Choose an image');
  });
});
