/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode } from '../vdom/vdom.js';
import { renderToDOM } from '../renderer/renderer.js';
import { getCurrentComponentInstance } from '../renderer/storage.js';

const portalContainers = new Set<HTMLElement>();

/**
 * Render a VNode into an arbitrary DOM node outside the component tree.
 * Returns a cleanup function that removes the portal content.
 */
export function createPortal(content: VNode, container: HTMLElement): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  portalContainers.add(container);
  renderToDOM(content, container);
  return () => {
    container.innerHTML = '';
    portalContainers.delete(container);
  };
}

/**
 * Return the VNode[] projected into a named slot from the parent component.
 * Call inside a component's render() method.
 */
export function useSlot(name: string): VNode[] {
  const instance = getCurrentComponentInstance();
  if (!instance) return [];
  const slotMap = (instance as any)._slotContent as Map<string, VNode[]> | undefined;
  return slotMap?.get(name) ?? [];
}
