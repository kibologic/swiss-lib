/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Render Performance Benchmarks
 * 
 * Tests rendering performance for common scenarios:
 * - Initial render
 * - Re-render with state change
 * - Large component tree
 * 
 * Run with: pnpm bench
 */

import { bench, describe } from 'vitest';
import { createVNode } from '../../src/vdom/vdom.js';
import { renderToDOM } from '../../src/renderer/renderer.js';

describe('Render Performance', () => {
  bench('render simple component tree', () => {
    const container = document.createElement('div');
    const vnode = createVNode('div', { id: 'app' }, [
      createVNode('h1', {}, ['Hello']),
      createVNode('p', {}, ['World']),
    ]);
    renderToDOM(vnode, container);
  });

  bench('render nested components (10 levels)', () => {
    const container = document.createElement('div');
    let vnode: any = createVNode('div', { id: 'root' });
    
    for (let i = 0; i < 10; i++) {
      vnode = createVNode('div', { id: `level-${i}` }, [vnode]);
    }
    
    renderToDOM(vnode, container);
  });

  bench('render large list (100 items)', () => {
    const container = document.createElement('div');
    const items = Array.from({ length: 100 }, (_, i) =>
      createVNode('li', { key: i }, [`Item ${i}`])
    );
    const vnode = createVNode('ul', {}, items);
    renderToDOM(vnode, container);
  });
});
