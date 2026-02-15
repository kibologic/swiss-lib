/*
 * Copyright (c) 2024 Themba Mzumara
 * Fragment Normalizer - Normalize fragments once during VNode creation
 * Licensed under the MIT License.
 */

import type { VNode } from "../vdom/vdom.js";
import { isFragmentVNode, filterValidVNodes } from "./types.js";

/**
 * Normalize fragments in VNode tree
 * Fragments are arrays of VNodes - normalize them once to avoid repeated expansion
 */
export function normalizeFragment(vnode: VNode | null | undefined | boolean): VNode | null | VNode[] {
  if (vnode == null || typeof vnode === "boolean") {
    return vnode as null;
  }

  // If already a fragment (array), normalize it
  if (isFragmentVNode(vnode)) {
    const children = Array.isArray(vnode) ? vnode : (vnode as any).children || [];
    const normalized = filterValidVNodes(children)
      .map((child) => normalizeFragment(child))
      .filter((c) => c != null) as VNode[];
    
    // Store normalized result on VNode for reuse
    if (typeof vnode === "object" && vnode !== null) {
      (vnode as any).__normalized = normalized;
    }
    
    return normalized.length === 1 ? normalized[0] : normalized;
  }

  // For element and component VNodes, normalize children
  if (typeof vnode === "object" && vnode !== null && "children" in vnode) {
    const children = (vnode as any).children;
    if (Array.isArray(children)) {
      const normalizedChildren = filterValidVNodes(children)
        .map((child) => normalizeFragment(child))
        .filter((c) => c != null) as VNode[];
      
      // Store normalized children
      (vnode as any).__normalizedChildren = normalizedChildren;
    }
  }

  return vnode;
}

/**
 * Get normalized fragment (from cache if available)
 */
export function getNormalizedFragment(vnode: VNode | null | undefined | boolean): VNode | null | VNode[] {
  if (vnode == null || typeof vnode === "boolean") {
    return vnode as null;
  }

  // Check if normalization result is cached
  if (typeof vnode === "object" && vnode !== null) {
    if (isFragmentVNode(vnode) && (vnode as any).__normalized) {
      return (vnode as any).__normalized;
    }
    
    if ("children" in vnode && (vnode as any).__normalizedChildren) {
      return {
        ...vnode,
        children: (vnode as any).__normalizedChildren,
      } as VNode;
    }
  }

  // Not cached, normalize now
  return normalizeFragment(vnode);
}
