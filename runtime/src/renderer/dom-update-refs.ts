/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Internal DOM reference propagation and transfer helpers.
 * These functions are NOT part of the public API — they support the update
 * pipeline in dom-updates.ts by managing .dom references on VNode objects
 * so that the reconciler can locate existing DOM nodes across render cycles.
 *
 * Exported only so that dom-updates.ts can import them.
 */

import type { SwissComponent } from "../component/component.js";
import type { VNode, VElement, ComponentVNode, ComponentType } from "../vdom/vdom.js";
import {
  vnodeMetadata,
  componentInstances,
  domToHostComponent,
} from "./storage.js";
import {
  isElementVNode,
  isComponentVNode,
  isTextVNode,
} from "./types.js";

// Re-export the storage maps so dom-updates.ts doesn't need a separate import.
export { vnodeMetadata, componentInstances, domToHostComponent };

// ─── Type aliases for function parameters ────────────────────────────────────

type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type CreateDOMNodeFn = (vnode: VNode | null | undefined | boolean) => Node;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;
type CanUpdateInPlaceFn = (
  dom: Node,
  newVNode: VNode,
  oldVNode?: VNode,
) => boolean;
type CleanupNodeFn = (node: Node) => void;

// ─── applyRenderedOutput ─────────────────────────────────────────────────────

export function applyRenderedOutput(
  hostDom: HTMLElement,
  vnode: ComponentVNode,
  oldRendered: VNode | undefined,
  newRendered: VNode,
  renderComponentFn: RenderComponentFn,
  createDOMNodeFn: CreateDOMNodeFn,
  cleanupNodeFn: CleanupNodeFn,
  canUpdateInPlaceFn: CanUpdateInPlaceFn,
  updateDOMNodeFn: UpdateDOMNodeFn,
) {
  if (newRendered == null || typeof newRendered === "boolean") {
    const parent = hostDom.parentNode;
    if (parent) {
      parent.removeChild(hostDom);
      cleanupNodeFn(hostDom);
    }
    return;
  }

  // Link internal tree root to the host DOM.
  if (typeof newRendered === "object" && newRendered !== null) {
    (newRendered as any).dom = hostDom;
  }

  // Preserve identity across renders.
  if (oldRendered) {
    transferDOMReferencesFromOldTree(newRendered, oldRendered, hostDom);
  }

  if (canUpdateInPlaceFn(hostDom, newRendered, oldRendered)) {
    updateDOMNodeFn(hostDom, newRendered);
    const updatedRendered = vnodeMetadata.get(hostDom) || newRendered;
    propagateDOMReferences(updatedRendered, hostDom);
    vnodeMetadata.set(hostDom, updatedRendered);
  } else {
    const newDom = createDOMNodeFn(newRendered);
    const parent = hostDom.parentNode;
    if (parent && hostDom.parentNode === parent) {
      parent.replaceChild(newDom, hostDom);
    } else if (parent) {
      parent.appendChild(newDom);
    }
    if (newDom !== hostDom) cleanupNodeFn(hostDom);
    propagateDOMReferences(newRendered, newDom);
  }
}

// ─── transferDOMReferencesFromOldTree ────────────────────────────────────────

/**
 * Transfers DOM references from old VNode tree to new VNode tree by structural matching.
 * This ensures new VNodes inherit DOM references before reconciliation, preventing recreation.
 */
export function transferDOMReferencesFromOldTree(
  newVNode: VNode,
  oldVNode: VNode | undefined,
  domNode: Node,
  visited: Set<object> = new Set(),
): void {
  if (!newVNode || typeof newVNode === "boolean" || !oldVNode) return;

  // Prevent infinite recursion
  if (typeof newVNode === "object" && newVNode !== null) {
    if (visited.has(newVNode)) return;
    visited.add(newVNode);
  }

  // Transfer DOM reference from old to new
  if (
    typeof oldVNode === "object" &&
    oldVNode !== null &&
    (oldVNode as any).dom
  ) {
    if (typeof newVNode === "object" && newVNode !== null) {
      (newVNode as any).dom = (oldVNode as any).dom;

      // For component VNodes, also transfer instance reference
      if (
        isComponentVNode(newVNode) &&
        isComponentVNode(oldVNode) &&
        newVNode.type === oldVNode.type
      ) {
        if ((oldVNode as any).__componentInstance) {
          (newVNode as any).__componentInstance = (
            oldVNode as any
          ).__componentInstance;
        }
      }
    }
  }

  // Recursively transfer for element VNodes with children
  if (isElementVNode(newVNode) && isElementVNode(oldVNode)) {
    const newChildren = Array.isArray(newVNode.children)
      ? newVNode.children
      : newVNode.children
        ? [newVNode.children]
        : [];
    const oldChildren = Array.isArray(oldVNode.children)
      ? oldVNode.children
      : oldVNode.children
        ? [oldVNode.children]
        : [];

    // Match children by index first (for same structure)
    for (let i = 0; i < newChildren.length && i < oldChildren.length; i++) {
      const newChild = newChildren[i];
      const oldChild = oldChildren[i];
      if (newChild && oldChild) {
        // Get DOM node for this child from the old tree
        let childDom: Node | undefined;
        if (
          typeof oldChild === "object" &&
          oldChild !== null &&
          (oldChild as any).dom
        ) {
          childDom = (oldChild as any).dom;
        } else if (
          domNode instanceof HTMLElement &&
          i < domNode.childNodes.length
        ) {
          childDom = domNode.childNodes[i];
        }

        if (childDom) {
          transferDOMReferencesFromOldTree(
            newChild,
            oldChild,
            childDom,
            visited,
          );
        }
      }
    }

    // CRITICAL FIX: Also match components by type across different structures
    // This handles cases where parent component types differ but nested components are the same
    // (e.g., LoginPage → ForgotPasswordPage, both use Stack, Card, Input, Button)
    if (domNode instanceof HTMLElement) {
      const searchForMatchingComponent = (
        element: HTMLElement,
        targetType: ComponentType,
      ): {
        instance: SwissComponent;
        dom: HTMLElement;
        vnode: VNode | undefined;
      } | null => {
        const instance = componentInstances.get(element);
        if (instance && instance.constructor === targetType) {
          const vnode = vnodeMetadata.get(element);
          return { instance, dom: element, vnode };
        }
        for (const child of Array.from(element.children)) {
          if (child instanceof HTMLElement) {
            const found = searchForMatchingComponent(child, targetType);
            if (found) return found;
          }
        }
        return null;
      };

      // For each new component child, try to find a matching old component by type
      for (const newChild of newChildren) {
        if (
          newChild &&
          isComponentVNode(newChild) &&
          typeof newChild === "object" &&
          newChild !== null
        ) {
          // Check if already matched by index
          const alreadyMatched = oldChildren.some((oldChild, idx) => {
            if (
              oldChild &&
              isComponentVNode(oldChild) &&
              oldChild.type === newChild.type
            ) {
              const oldChildDom = (oldChild as any).dom;
              if (
                oldChildDom &&
                idx < newChildren.length &&
                newChildren[idx] === newChild
              ) {
                return true; // Already matched by index
              }
            }
            return false;
          });

          if (!alreadyMatched) {
            // Search DOM tree for matching component type
            const found = searchForMatchingComponent(domNode, newChild.type);
            if (found && found.vnode) {
              // Transfer instance and DOM reference
              (newChild as any).__componentInstance = found.instance;
              (newChild as any).dom = found.dom;
              // Recursively transfer for the component's rendered tree
              transferDOMReferencesFromOldTree(
                newChild,
                found.vnode,
                found.dom,
                visited,
              );
            }
          }
        }
      }
    }
  }

  // CRITICAL FIX: When parent component types differ (e.g., LoginPage → ForgotPasswordPage),
  // still try to match nested components by type to preserve component instances
  // This allows Stack, Card, Input, Button components to be reused across page changes
  if (isComponentVNode(newVNode) && domNode instanceof HTMLElement) {
    // Search the DOM tree for matching component types
    const searchForMatchingComponent = (
      element: HTMLElement,
      targetType: ComponentType,
    ): { instance: SwissComponent; dom: HTMLElement } | null => {
      const instance = componentInstances.get(element);
      if (instance && instance.constructor === targetType) {
        return { instance, dom: element };
      }
      for (const child of Array.from(element.children)) {
        if (child instanceof HTMLElement) {
          const found = searchForMatchingComponent(child, targetType);
          if (found) return found;
        }
      }
      return null;
    };

    // If this component type matches, transfer instance
    if (isComponentVNode(oldVNode) && newVNode.type === oldVNode.type) {
      if ((oldVNode as any).__componentInstance) {
        if (typeof newVNode === "object" && newVNode !== null) {
          (newVNode as any).__componentInstance = (
            oldVNode as any
          ).__componentInstance;
        }
      }
    } else {
      // Parent types differ - search DOM for matching component instance
      const found = searchForMatchingComponent(domNode, newVNode.type);
      if (found && typeof newVNode === "object" && newVNode !== null) {
        (newVNode as any).__componentInstance = found.instance;
        (newVNode as any).dom = found.dom;
      }
    }

    // Recursively transfer for component's rendered tree
    // Get the old rendered tree from metadata
    const oldRendered = vnodeMetadata.get(domNode);
    if (oldRendered) {
      const newRendered = (newVNode as any).__rendered;
      if (newRendered && oldRendered) {
        // Transfer references from old rendered tree to new rendered tree
        // This allows nested components to be reused even when parent changes
        transferDOMReferencesFromOldTree(
          newRendered,
          oldRendered,
          domNode,
          visited,
        );
      }
    }
  }
}

// ─── propagateDOMReferences ──────────────────────────────────────────────────

/**
 * Propagates DOM references from the actual DOM tree to the VNode tree.
 * This ensures that nested VNodes have their .dom property set, which is
 * critical for reconciliation to match existing DOM nodes.
 *
 * Uses a visited set to prevent infinite recursion on circular structures.
 */
export function propagateDOMReferences(
  vnode: VNode,
  domNode: Node,
  visited: Set<object> = new Set(),
): void {
  if (!vnode || typeof vnode === "boolean") return;

  // Prevent infinite recursion (only track object VNodes, strings are immutable)
  if (typeof vnode === "object" && vnode !== null) {
    if (visited.has(vnode)) return;
    visited.add(vnode);
  }

  if (isElementVNode(vnode)) {
    // Set DOM reference on this element VNode
    if (typeof vnode === "object" && vnode !== null) {
      (vnode as any).dom = domNode;
    }

    // Recursively propagate to children (only for element VNodes)
    if (vnode.children && domNode instanceof HTMLElement) {
      const children = Array.isArray(vnode.children)
        ? vnode.children
        : [vnode.children];
      const domChildren = Array.from(domNode.childNodes);

      let domChildIndex = 0;
      for (const childVNode of children) {
        if (childVNode == null || typeof childVNode === "boolean") continue;

        // Find matching DOM node
        let matchingDom: Node | null = null;

        // Try to match by ID first (search only within current DOM node)
        if (isElementVNode(childVNode) && childVNode.props?.id) {
          const id = String(childVNode.props.id);
          // Search only direct children and their descendants
          for (const child of Array.from(domNode.childNodes)) {
            if (child instanceof HTMLElement) {
              if (child.id === id) {
                matchingDom = child;
                break;
              }
              // Also check descendants
              const found = child.querySelector(`#${CSS.escape(id)}`);
              if (found) {
                matchingDom = found;
                break;
              }
            }
          }
        }

        // If no ID match, try by index and type
        if (!matchingDom && domChildIndex < domChildren.length) {
          const candidateDom = domChildren[domChildIndex];
          if (isTextVNode(childVNode)) {
            if (candidateDom.nodeType === Node.TEXT_NODE) {
              matchingDom = candidateDom;
              domChildIndex++;
            }
          } else if (isElementVNode(childVNode)) {
            if (
              candidateDom.nodeType === Node.ELEMENT_NODE &&
              (candidateDom as HTMLElement).tagName.toLowerCase() ===
                childVNode.type.toLowerCase()
            ) {
              matchingDom = candidateDom;
              domChildIndex++;
            }
          } else if (isComponentVNode(childVNode)) {
            // For components, the DOM node is the component's host element
            if (candidateDom.nodeType === Node.ELEMENT_NODE) {
              matchingDom = candidateDom;
              domChildIndex++;
              // Set DOM reference on component VNode, but don't recurse into its rendered tree
              // (that's already handled by updateComponentNode)
              if (typeof childVNode === "object" && childVNode !== null) {
                (childVNode as any).dom = matchingDom;
              }
            }
          }
        }

        // Only recurse for element VNodes (not components - their rendered trees are handled separately)
        if (matchingDom && isElementVNode(childVNode)) {
          propagateDOMReferences(childVNode, matchingDom, visited);
        }
      }
    }
  } else if (isComponentVNode(vnode)) {
    // For component VNodes, just set the DOM reference
    // Don't recurse into rendered tree - that's already handled by updateComponentNode
    if (typeof vnode === "object" && vnode !== null) {
      (vnode as any).dom = domNode;
    }
  } else if (isTextVNode(vnode)) {
    // Text nodes
    if (
      typeof vnode === "object" &&
      vnode !== null &&
      domNode.nodeType === Node.TEXT_NODE
    ) {
      (vnode as any).dom = domNode;
    }
  }
}
