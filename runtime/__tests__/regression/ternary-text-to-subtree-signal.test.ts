// @vitest-environment jsdom
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Regression: FRAME-WA-005, real component / signal-driven path.
 *
 * The earlier ternary-text-to-subtree.test.ts drives renderToDOM directly and
 * passes -- that only proves the raw reconciler function is fine when called
 * externally with a freshly built vnode tree each time. The REPORTED bug is a
 * live SwissComponent whose render() reads reactive state and re-renders via
 * its OWN signal effect (reactivity-setup.ts's renderEffect -> commitVNode),
 * exactly like `previewJob(...)` assigning `this.previewResult` in Nostromo.
 * This test mounts a real component and mutates reactive state to go through
 * that exact commit path.
 */

import "reflect-metadata";
import { describe, it, expect } from 'vitest';
import { createElement as h } from '../../src/vdom/vdom.js';
import { SwissComponent } from '../../src/component/component.js';
import type { BaseComponentProps, BaseComponentState } from '../../src/component/types/index.js';

interface PanelState extends BaseComponentState {
  hasResult: boolean;
}

class PreviewPanel extends SwissComponent<BaseComponentProps, PanelState> {
  constructor(props: BaseComponentProps) {
    super(props);
    this.state = { hasResult: false } as PanelState;
  }

  render() {
    return h(
      'div',
      { class: 'panel' },
      this.state.hasResult
        ? h('div', { class: 'result' },
            h('img', { class: 'thumb', src: 'x.png' }),
            h('span', { class: 'caption' }, 'golden-512x341.jpg loaded (512x341px)'),
          )
        : 'Choose an image to see a live preview.',
    );
  }
}

function getContainer(): HTMLElement {
  let el = document.getElementById('test-root-wa005-signal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'test-root-wa005-signal';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  return el;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('FRAME-WA-005 — ternary text-to-subtree swap via signal-driven commitVNode', () => {
  it('patches the DOM when reactive state flips text -> rich subtree', async () => {
    const container = getContainer();
    const panel = new PreviewPanel({});
    panel.mount(container);

    expect(container.querySelector('.panel')?.textContent).toContain('Choose an image');
    expect(container.querySelector('.result')).toBeNull();

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    expect(container.querySelector('.result')).not.toBeNull();
    expect(container.querySelector('.thumb')).not.toBeNull();
    expect(container.textContent).not.toContain('Choose an image');
  });

  it('patches the DOM when reactive state flips rich subtree -> text', async () => {
    const container = getContainer();
    const panel = new PreviewPanel({});
    panel.mount(container);

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    expect(container.querySelector('.result')).not.toBeNull();

    (panel.state as PanelState).hasResult = false;
    await flushMicrotasks();

    expect(container.querySelector('.result')).toBeNull();
    expect(container.textContent).toContain('Choose an image');
  });

  it('does not stay permanently stuck across further unrelated updates once flipped', async () => {
    const container = getContainer();
    const panel = new PreviewPanel({});
    panel.mount(container);

    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    // Simulate "editing unrelated state twice more" — re-render with the same true value.
    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();
    (panel.state as PanelState).hasResult = true;
    await flushMicrotasks();

    expect(container.querySelector('.result')).not.toBeNull();
  });
});
