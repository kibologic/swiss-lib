/*
 * Copyright (c) 2024 Themba Mzumara
 * Render Cache - Memoize component renders to skip reconciliation when unchanged
 * Licensed under the MIT License.
 */

import type { VNode } from "../vdom/vdom.js";
import type { SwissComponent } from "../component/component.js";

/**
 * Hash props for cache key
 * Simple shallow hash - only works for primitive props
 */
function hashProps(props: Record<string, unknown>): string {
  const keys = Object.keys(props).sort();
  const values = keys.map((key) => {
    const value = props[key];
    if (value === null || value === undefined) return `${key}:null`;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return `${key}:${value}`;
    }
    // For objects/arrays, use JSON (not perfect but works for simple cases)
    try {
      return `${key}:${JSON.stringify(value)}`;
    } catch {
      return `${key}:${String(value)}`;
    }
  });
  return values.join("|");
}

interface CachedRender {
  vnode: VNode;
  propsHash: string;
  timestamp: number;
}

/**
 * Render cache using WeakMap (automatically garbage collected)
 */
const renderCache = new WeakMap<SwissComponent, CachedRender>();

/**
 * Get cached render if props haven't changed
 */
export function getCachedRender(
  instance: SwissComponent,
  props: Record<string, unknown>,
): VNode | null {
  const cached = renderCache.get(instance);
  if (!cached) {
    return null;
  }

  const currentHash = hashProps(props);
  if (cached.propsHash === currentHash) {
    // Props unchanged - return cached render
    return cached.vnode;
  }

  return null;
}

/**
 * Cache render result
 */
export function cacheRender(
  instance: SwissComponent,
  props: Record<string, unknown>,
  vnode: VNode,
): void {
  const propsHash = hashProps(props);
  renderCache.set(instance, {
    vnode,
    propsHash,
    timestamp: Date.now(),
  });
}

/**
 * Clear cache for a component instance
 */
export function clearRenderCache(instance: SwissComponent): void {
  renderCache.delete(instance);
}
