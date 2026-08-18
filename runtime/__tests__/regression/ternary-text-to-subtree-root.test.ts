// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression: FRAME-WA-005, root-level ternary variant.
 *
 * AgentFloor.uix's shipped workaround comment (per the task notes) describes
 * "separate top-level returns per branch" as the trigger -- i.e. render()
 * ITSELF returns `cond ? <text/> : <subtree/>` as its top-level result
 * (component root swaps shape), not a ternary nested as one child inside a
 * stable wrapper element. The two prior repro files (direct renderToDOM, and
 * a wrapper <div> whose single CHILD is the ternary, via a real component's
 * signal-driven commitVNode) both passed. This isolates the one remaining
 * structural difference: the ternary at the render() ROOT itself, which
 * goes through updateComponentNode/applyRenderedOutput's canUpdateInPlace
 * check rather than updateElementNode's reconcileChildren.
 */

import "reflect-metadata";
import { describe, it, expect } from 'vitest';
import { createElement as h } from '../../src/vdom/vdom.js';
import { SwissComponent } from '../../src/component/component.js';
import type { BaseComponentProps, BaseComponentState } from '../../src/component/types/index.js';

interface PanelState extends BaseComponentState {
  hasResult: boolean;
}

class RootTernaryPanel extends SwissComponent<BaseComponentProps, PanelState> {
  constructor(props: BaseComponentProps) {
    super(props);
    this.state = { hasResult: false } as PanelState;
  }

  renderResult() {
    return h('div', { class: 'result' },
      h('img', { class: 'thumb', src: 'x.png' }),
      h('span', { class: 'caption' }, 'golden-512x341.jpg loaded (512x341px)'),
    );
  }

  // Top-level return per branch -- no stable wrapper element at all.
  render() {
    return this.state.hasResult
      ? this.renderResult()
      : h('span', { class: 'placeholder' }, 'Choose an image to see a live preview.');
  }
}

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root-wa005-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root-wa005-root';
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

describe('FRAME-WA-005 — root-level ternary text-to-subtree swap (no stable wrapper)', () => {
  it('patches the DOM when render() root flips text -> rich subtree', async () => {
    const container = getContainer();
    const panel = new RootTernaryPanel({});
    panel.mount(container);

    expect(container.textContent).toContain('Choose an image');
    expect(container.querySelector('.result')).toBeNull();

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    expect(container.querySelector('.result')).not.toBeNull();
    expect(container.textContent).not.toContain('Choose an image');
  });

  it('patches the DOM when render() root flips rich subtree -> text', async () => {
    const container = getContainer();
    const panel = new RootTernaryPanel({});
    panel.mount(container);

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    expect(container.querySelector('.result')).not.toBeNull();

    (panel.state as PanelState).hasResult = false;
    await flushMicrotasks();

    expect(container.querySelector('.result')).toBeNull();
    expect(container.textContent).toContain('Choose an image');
  });
});
