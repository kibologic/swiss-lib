/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { VNode, ComponentVNode } from "../vdom/vdom.js";
import {
  componentInstances,
  domToHostComponent,
  vnodeMetadata,
} from "./storage.js";
import {
  getKey,
  canUpdateInPlace,
  isComponentVNode,
  isElementVNode,
  cleanupNode,
} from "./types.js";

// Forward declarations - these will be imported from other modules
// We use function declarations to allow hoisting and avoid circular dependency issues
declare function updateDOMNode(dom: Node, vnode: VNode): void;
declare function createDOMNode(vnode: VNode | null | undefined | boolean): Node;

// Key-based child diffing algorithm
export function reconcileChildren(
  parent: HTMLElement,
  oldChildren: VNode[],
  newChildren: VNode[],
  updateDOMNodeFn: typeof updateDOMNode,
  createDOMNodeFn: typeof createDOMNode,
) {
  const oldChildNodes = Array.from(parent.childNodes);

  // Build key maps for efficient lookups
  const oldKeyMap = new Map<
    string | number,
    { vnode: VNode; index: number; dom: Node }
  >();
  const newKeyMap = new Map<string | number, { vnode: VNode; index: number }>();

  // Build a map of DOM nodes by id for fallback matching
  const domByIdMap = new Map<string, Node>();
  oldChildNodes.forEach((node) => {
    if (node instanceof HTMLElement) {
      if (node.id) {
        domByIdMap.set(node.id, node);
      }
    }
  });

  oldChildren.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    // CRITICAL: Use vnode.dom directly instead of looking up by index
    // This ensures we correctly match old VNodes with their DOM nodes
    let dom =
      typeof vnode === "object" && vnode !== null && (vnode as any).dom
        ? (vnode as any).dom
        : oldChildNodes[index];

    // Fallback: Try to match by id if direct match fails
    if (!dom && isElementVNode(vnode) && vnode.props?.id) {
      const id = String(vnode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        dom = domById;
        // CRITICAL: Set the dom reference on the old VNode so it can be matched later
        if (typeof vnode === "object" && vnode !== null) {
          (vnode as any).dom = dom;
        }
      }
    }

    // We intentionally do not scan DOM subtrees to find matches.
    // Identity must come from keys / direct vnode.dom references.

    if (dom) oldKeyMap.set(key, { vnode, index, dom });
  });

  newChildren.forEach((vnode, index) => {
    const key = getKey(vnode, index);
    newKeyMap.set(key, { vnode, index });
  });

  const processedNodes = new Set<Node>();
  const newDoms: Node[] = [];

  // First pass: update existing nodes
  newChildren.forEach((newVNode, newIndex) => {
    // Skip null/undefined/boolean children (React/SWISS allows these to skip rendering)
    if (newVNode == null || typeof newVNode === "boolean") {
      return;
    }

    const key = getKey(newVNode, newIndex);
    let oldEntry = oldKeyMap.get(key);

    // For components we do not bypass keys and do not scan the DOM.
    // If a component has no stable key, it will be keyed by index via getKey().

    // ENHANCEMENT: Aggressive ID Matching - try ID matching BEFORE key matching fails
    // This ensures DOM identity is restored early in the process
    if (!oldEntry && isElementVNode(newVNode) && newVNode.props?.id) {
      const id = String(newVNode.props.id);
      const domById = domByIdMap.get(id);
      if (domById) {
        // First, try to find an old VNode that already has this DOM node
        for (const entry of oldKeyMap.values()) {
          if (entry.dom === domById) {
            oldEntry = entry;
            break;
          }
        }

        // If still not found, search recursively in oldChildren by matching id
        if (!oldEntry) {
          const findVNodeById = (vnodes: VNode[]): VNode | null => {
            for (const v of vnodes) {
              if (isElementVNode(v) && v.props?.id === id) {
                return v;
              }
              // Recursively search children
              if (isElementVNode(v) && v.children) {
                const found = findVNodeById(v.children);
                if (found) return found;
              }
            }
            return null;
          };

          const matchingOldVNode = findVNodeById(oldChildren);
          if (matchingOldVNode) {
            const oldIndex = oldChildren.indexOf(matchingOldVNode);
            // CRITICAL: PATCH - Restore the link to the DOM
            // This must happen BEFORE we decide to update or create
            if (
              typeof matchingOldVNode === "object" &&
              matchingOldVNode !== null
            ) {
              (matchingOldVNode as any).dom = domById;
            }
            oldEntry = {
              vnode: matchingOldVNode,
              index: oldIndex >= 0 ? oldIndex : 0, // Use 0 as fallback if not found in direct children
              dom: domById,
            };
            // Add to map for future lookups
            oldKeyMap.set(key, oldEntry);
          }
        }
      }
    }

    if (oldEntry) {
      const { dom, vnode: oldVNode } = oldEntry;

      // CRITICAL FIX: Transfer DOM reference IMMEDIATELY when we find a match
      // This must happen BEFORE any decision about update vs create
      // Without this, the new VNode is treated as "new" and triggers initialize()
      if (typeof newVNode === "object" && newVNode !== null) {
        (newVNode as any).dom = dom;
      }

      // CRITICAL: For component VNodes, preserve the existing instance before updating
      // This prevents creating new instances during reactive updates
      if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        // Same component type - preserve the instance. Prefer host (e.g. EventBusProvider)
        // when DOM is the child's root (domToHostComponent) so we don't use the wrong instance (e.g. Shell).
        const direct = componentInstances.get(dom as HTMLElement);
        const host = domToHostComponent.get(dom as HTMLElement);
        const existingInstance =
          (oldVNode as any).__componentInstance ||
          (host && host.constructor === newVNode.type ? host : null) ||
          (direct && direct.constructor === newVNode.type ? direct : null);
        if (
          existingInstance &&
          typeof newVNode === "object" &&
          newVNode !== null
        ) {
          // Store the existing instance on the new VNode
          (newVNode as any).__componentInstance = existingInstance;
          // Mark as initialized to prevent re-initialization
          (existingInstance as any)._initialized = true;
          (existingInstance as any).__initialized = true;
        }
      }

      if (canUpdateInPlace(dom, newVNode, oldVNode)) {
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else if (
        newVNode &&
        oldVNode &&
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        // CRITICAL: For same-type component VNodes, ALWAYS update in place
        // Don't create a new DOM node - use updateDOMNode which will call updateComponentNode
        // updateComponentNode knows how to find and reuse the existing instance
        // DOM reference already set above, just update
        updateDOMNodeFn(dom, newVNode);
        processedNodes.add(dom);
        newDoms.push(dom);
      } else {
        // Different types or can't update in place - create new DOM
        const newDom = createDOMNodeFn(newVNode);
        // Store DOM reference on the new VNode
        if (typeof newVNode === "object" && newVNode !== null) {
          (newVNode as any).dom = newDom;
        }
        // Check if dom is still a child of parent before replacing
        // It might have been removed or moved during a previous iteration
        if (dom.parentNode === parent) {
          parent.replaceChild(newDom, dom);
        } else {
          // Node was already removed/moved - insert at the correct position
          const nextSibling = parent.childNodes[newIndex];
          if (nextSibling) {
            parent.insertBefore(newDom, nextSibling);
          } else {
            parent.appendChild(newDom);
          }
        }
        processedNodes.add(newDom);
        newDoms.push(newDom);
      }
    } else {
      const newDom = createDOMNodeFn(newVNode);
      if (typeof newVNode === "object" && newVNode !== null) {
        (newVNode as any).dom = newDom;
      }
      newDoms.push(newDom);
    }
  });

  // Second pass: reorder nodes
  newDoms.forEach((dom, newIndex) => {
    const currentDom = parent.childNodes[newIndex];
    if (currentDom !== dom) {
      if (parent.childNodes[newIndex]) {
        parent.insertBefore(dom, parent.childNodes[newIndex]);
      } else {
        parent.appendChild(dom);
      }
    }
  });

  // Remove leftover nodes (skip when parent has data-preserve-children, e.g. xterm container)
  if (
    parent instanceof HTMLElement &&
    parent.getAttribute?.("data-preserve-children") != null
  ) {
    return;
  }
  oldChildNodes.forEach((node) => {
    if (!processedNodes.has(node)) {
      cleanupNode(node);
      // Check if node is still a child before removing (it might have been moved/removed during reordering)
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }
  });
}
