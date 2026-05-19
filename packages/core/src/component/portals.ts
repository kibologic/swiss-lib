/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode } from '../vdom/vdom.js';
import { renderToDOM } from '../renderer/renderer.js';
import { getCurrentComponentInstance } from '../renderer/storage.js';

/**
 * Render a VNode into an arbitrary DOM node outside the component tree.
 *
 * The portal is registered on the current component instance's `_portals` map so
 * that `unmountComponent()` cleans it up automatically. If called outside a component
 * render (e.g. imperatively), the caller is responsible for invoking the returned
 * cleanup function.
 *
 * Returns a cleanup function that removes the portal content and deregisters the entry.
 */
export function createPortal(content: VNode, container: HTMLElement): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const instance = getCurrentComponentInstance();

  renderToDOM(content, container);

  // Register on the owning component so unmountComponent() cleans up automatically.
  // _portals already exists on every SwissComponent (Map<HTMLElement, VNode>).
  if (instance) {
    (instance as any)._portals.set(container, content);
  }

  return () => {
    container.innerHTML = '';
    if (instance) {
      (instance as any)._portals.delete(container);
    }
  };
}

/**
 * Return the VNode[] projected into a named slot from the parent component.
 *
 * Must be called during a component's `render()` method — `getCurrentComponentInstance()`
 * is only non-null during synchronous render execution.
 */
export function useSlot(name: string): VNode[] {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('[SwissJS] useSlot() called outside a component render() method — returning []');
    }
    return [];
  }
  const slotMap = (instance as any)._slotContent as Map<string, VNode[]> | undefined;
  return slotMap?.get(name) ?? [];
}
