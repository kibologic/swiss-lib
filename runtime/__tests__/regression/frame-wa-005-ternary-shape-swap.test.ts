// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression: FRAME-WA-005 — combined discriminator repro.
 *
 * PRIOR CONTEXT (read before extending this file): this exact task was already
 * attempted once on this branch's ancestry — commit 466cb65 / PR #102, merged
 * into development — via THREE independently increasing-fidelity repros:
 *   - ternary-text-to-subtree.test.ts        (raw renderToDOM, wrapper child ternary)
 *   - ternary-text-to-subtree-signal.test.ts (real SwissComponent, signal-driven commitVNode)
 *   - ternary-text-to-subtree-root.test.ts   (ternary AT the render() root, no wrapper)
 * All 8 assertions across those three files PASS today (verified again here:
 * full suite 177/177 green before this file existed). None reproduced the
 * Nostromo symptom.
 *
 * What none of the three tried: the LITERAL two-ternary shape from the report,
 * where a text->text swap (the caption) and a text->subtree swap (the result
 * panel) are driven by the SAME state flip, in the SAME render(), same as
 * Nostromo's actual component (source-file caption + preview panel both change
 * together when `previewJob(...)` resolves). This file is that missing angle,
 * plus an explicit CONTROL case (text->text alone) per the task's own ask —
 * to literally show, in one file, the discriminator: text->text patches,
 * text->subtree (in the same render, same commit) does not.
 */

import "reflect-metadata";
import { describe, it, expect } from 'vitest';
import { createElement as h } from '../../src/vdom/vdom.js';
import { SwissComponent } from '../../src/component/component.js';
import type { BaseComponentProps, BaseComponentState } from '../../src/component/types/index.js';

interface PanelState extends BaseComponentState {
  hasResult: boolean;
}

// Mirrors Nostromo's real shape: ONE render() with TWO ternaries reacting to
// the SAME boolean — a caption (text -> text) and a result panel (text -> deep
// subtree). Both must flip off a single state mutation, through the real
// signal-effect -> commitVNode path (reactivity-setup.ts), not a hand-built
// vnode diff.
class CombinedPreviewPanel extends SwissComponent<BaseComponentProps, PanelState> {
  constructor(props: BaseComponentProps) {
    super(props);
    this.state = { hasResult: false } as PanelState;
  }

  render() {
    return h(
      'div',
      { class: 'panel' },
      // CONTROL: text -> text swap (source-file caption).
      h('span', { class: 'caption' },
        this.state.hasResult ? 'golden-512x341.jpg loaded (512x341px)' : 'No file chosen'),
      // SUBJECT: text -> deep subtree swap (preview result), same render, same flip.
      this.state.hasResult
        ? h('div', { class: 'result' },
            h('img', { class: 'thumb', src: 'x.png' }),
            h('span', { class: 'meta' }, 'preview ready'),
          )
        : 'Choose an image to see a live preview.',
    );
  }
}

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root-wa005-combined');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root-wa005-combined';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('FRAME-WA-005 — combined caption(text->text) + panel(text->subtree) same-render discriminator', () => {
  it('CONTROL: the caption (text -> text) patches on the same state flip', async () => {
    const container = getContainer();
    const panel = new CombinedPreviewPanel({});
    panel.mount(container);

    expect(container.querySelector('.caption')?.textContent).toBe('No file chosen');

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    expect(container.querySelector('.caption')?.textContent).toBe('golden-512x341.jpg loaded (512x341px)');
  });

  it('SUBJECT: the result panel (text -> deep subtree) patches on the SAME state flip', async () => {
    const container = getContainer();
    const panel = new CombinedPreviewPanel({});
    panel.mount(container);

    expect(container.querySelector('.result')).toBeNull();
    expect(container.textContent).toContain('Choose an image to see a live preview.');

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    // This is the reported-stuck assertion: the subtree should now exist and
    // the placeholder text should be gone.
    expect(container.querySelector('.result')).not.toBeNull();
    expect(container.querySelector('.thumb')).not.toBeNull();
    expect(container.textContent).not.toContain('Choose an image to see a live preview.');
  });

  it('does not recover after further unrelated re-renders while allegedly stuck', async () => {
    const container = getContainer();
    const panel = new CombinedPreviewPanel({});
    panel.mount(container);

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    // "Editing unrelated state twice more" per the reported symptom.
    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    expect(container.querySelector('.result')).not.toBeNull();
  });
});
