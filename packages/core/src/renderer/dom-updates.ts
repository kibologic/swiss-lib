/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SwissComponent } from "../component/component.js";
import type { VNode, VElement, ComponentVNode } from "../vdom/vdom.js";
import {
  vnodeMetadata,
  componentInstances,
  domToHostComponent,
} from "./storage.js";
import {
  isSignal,
  isTextVNode,
  isElementVNode,
  isComponentVNode,
  cleanupNode,
} from "./types.js";
import { DiffingError } from "./errors.js";
import { clearRenderCache } from "./render-cache.js";

function applyRenderedOutput(
  hostDom: HTMLElement,
  vnode: ComponentVNode,
  oldRendered: VNode | undefined,
  newRendered: VNode,
  renderComponentFn: RenderComponentFn,
  createDOMNodeFn: CreateDOMNodeFn,
  cleanupNodeFn: (node: Node) => void,
  canUpdateInPlaceFn: (dom: Node, newVNode: VNode, oldVNode?: VNode) => boolean,
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

/**
 * Propagates DOM references from the actual DOM tree to the VNode tree.
 * This ensures that nested VNodes have their .dom property set, which is
 * critical for reconciliation to match existing DOM nodes.
 *
 * Uses a visited set to prevent infinite recursion on circular structures.
 */
/**
 * Transfers DOM references from old VNode tree to new VNode tree by structural matching.
 * This ensures new VNodes inherit DOM references before reconciliation, preventing recreation.
 */
function transferDOMReferencesFromOldTree(
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
        targetType: any,
      ): {
        instance: any;
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
      targetType: any,
    ): { instance: any; dom: HTMLElement } | null => {
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

function propagateDOMReferences(
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

// Forward declarations for functions passed as parameters
type UpdateTextNodeFn = (dom: Text, vnode: string | number) => void;
type UpdateElementNodeFn = (
  dom: HTMLElement,
  vnode: VElement,
  oldVNode?: VNode,
) => void;
type UpdateComponentNodeFn = (
  dom: HTMLElement,
  vnode: ComponentVNode,
  oldVNode?: VNode,
) => void;
type RenderComponentFn = (
  vnode: ComponentVNode,
  existingInstance?: SwissComponent,
) => VNode;
type CreateDOMNodeFn = (vnode: VNode | null | undefined | boolean) => Node;
type UpdateDOMNodeFn = (dom: Node, vnode: VNode) => void;

export function updateDOMNode(
  dom: Node,
  vnode: VNode,
  updateTextNodeFn: UpdateTextNodeFn,
  updateElementNodeFn: UpdateElementNodeFn,
  updateComponentNodeFn: UpdateComponentNodeFn,
): void {
  try {
    if (vnode == null || typeof vnode === "boolean") {
      const parent = dom.parentNode;
      if (parent) {
        parent.removeChild(dom);
        cleanupNode(dom);
      }
      return;
    }

    if (isSignal(vnode)) {
      updateDOMNode(
        dom,
        vnode.value as VNode,
        updateTextNodeFn,
        updateElementNodeFn,
        updateComponentNodeFn,
      );
      return;
    }

    const oldVNode = vnodeMetadata.get(dom);

    if (isTextVNode(vnode)) {
      updateTextNodeFn(dom as Text, vnode);
    } else if (isElementVNode(vnode)) {
      updateElementNodeFn(dom as HTMLElement, vnode, oldVNode);
    } else if (isComponentVNode(vnode)) {
      updateComponentNodeFn(dom as HTMLElement, vnode, oldVNode);
    }

    if (vnode != null && typeof vnode !== "boolean") {
      vnodeMetadata.set(dom, vnode);
    }
    if (typeof vnode === "object" && vnode !== null && "dom" in vnode) {
      (vnode as { dom: Node }).dom = dom;
    }
  } catch (error) {
    console.error("DOM update error:", error);
    const updateErrorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new DiffingError(`DOM update failed: ${updateErrorMessage}`, vnode);
  }
}

export function updateTextNode(dom: Text, vnode: string | number) {
  if (dom.textContent !== String(vnode)) {
    dom.textContent = String(vnode);
  }
}

export function updateElementNode(
  dom: HTMLElement,
  vnode: VElement,
  oldVNode: VNode | undefined,
  reconcilePropsFn: (
    element: HTMLElement,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>,
  ) => void,
  reconcileChildrenFn: (
    parent: HTMLElement,
    oldChildren: VNode[],
    newChildren: VNode[],
  ) => void,
) {
  let oldProps: Record<string, unknown> = {};
  let oldChildren: VNode[] = [];

  if (oldVNode !== undefined && isElementVNode(oldVNode)) {
    oldProps = oldVNode.props || {};
    const rawOld = oldVNode.children;
    oldChildren = Array.isArray(rawOld)
      ? rawOld
      : rawOld != null && typeof rawOld !== "boolean"
        ? [rawOld]
        : [];

    // CRITICAL FIX: Restore DOM references on old children VNodes
    // Without this, reconcileChildren can't match old VNodes to existing DOM nodes
    const domChildren = Array.from(dom.childNodes);
    oldChildren.forEach((oldChild, index) => {
      if (oldChild == null || typeof oldChild === "boolean") return;

      // If old child already has DOM reference, keep it
      if (
        typeof oldChild === "object" &&
        oldChild !== null &&
        (oldChild as any).dom
      ) {
        return;
      }

      // Try to restore from metadata first
      if (index < domChildren.length) {
        const childDom = domChildren[index];
        const metadataVNode = vnodeMetadata.get(childDom);
        if (
          metadataVNode &&
          typeof oldChild === "object" &&
          oldChild !== null
        ) {
          // If metadata has a VNode, check if it matches
          if (
            isComponentVNode(oldChild) &&
            isComponentVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            (oldChild as any).dom = childDom;
            return;
          }
          if (
            isElementVNode(oldChild) &&
            isElementVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            (oldChild as any).dom = childDom;
            return;
          }
        }

        // Fallback: match by type and position
        if (isElementVNode(oldChild) && childDom instanceof HTMLElement) {
          if (childDom.tagName.toLowerCase() === oldChild.type.toLowerCase()) {
            (oldChild as any).dom = childDom;
          }
        } else if (
          isComponentVNode(oldChild) &&
          childDom instanceof HTMLElement
        ) {
          // Prefer host when it matches type (parent that rendered this root, e.g. EventBusProvider)
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const instance =
            (host && host.constructor === oldChild.type ? host : null) ||
            (direct && direct.constructor === oldChild.type ? direct : null);
          if (instance) {
            (oldChild as any).dom = childDom;
            (oldChild as any).__componentInstance = instance;
          }
        }
      }
    });
  }

  const newProps = vnode.props || {};
  const rawNew = vnode.children;
  const newChildren: VNode[] = Array.isArray(rawNew)
    ? rawNew
    : rawNew != null && typeof rawNew !== "boolean"
      ? [rawNew]
      : [];

  // CRITICAL: Transfer DOM refs from existing DOM to new children when new child has no .dom
  // Fixes root update clearing content (e.g. App → div.erp-root → EventBusProvider)
  const domChildren = Array.from(dom.childNodes);
  newChildren.forEach((newChild, i) => {
    if (newChild == null || typeof newChild === "boolean") return;
    if (
      typeof newChild === "object" &&
      newChild !== null &&
      (newChild as any).dom
    )
      return;
    if (i >= domChildren.length) return;
    const childDom = domChildren[i];
    if (isComponentVNode(newChild) && childDom instanceof HTMLElement) {
      // Prefer host (parent that rendered this root) when it matches type - fixes root update when parent renders single child component (e.g. EventBusProvider → Shell)
      const direct = componentInstances.get(childDom);
      const host = domToHostComponent.get(childDom);
      const instance =
        (host && host.constructor === newChild.type ? host : null) ||
        (direct && direct.constructor === newChild.type ? direct : null);
      if (instance) {
        (newChild as any).dom = childDom;
        (newChild as any).__componentInstance = instance;
      }
    } else if (isElementVNode(newChild) && childDom instanceof HTMLElement) {
      if (
        childDom.nodeType === Node.ELEMENT_NODE &&
        (childDom as HTMLElement).tagName.toLowerCase() ===
          (newChild as any).type?.toLowerCase()
      ) {
        (newChild as any).dom = childDom;
      }
    }
  });

  reconcilePropsFn(dom, oldProps, newProps);
  // Skip child reconciliation for containers that own their DOM (e.g. xterm). Prevents wiping imperative children.
  if (
    !(dom instanceof HTMLElement) ||
    dom.getAttribute?.("data-preserve-children") == null
  ) {
    reconcileChildrenFn(dom, oldChildren, newChildren);
  }

  // CRITICAL: Explicitly transfer identity - the newVNode now represents this specific DOM node
  // If this link is missing, the next render cycle won't know this node exists
  if (typeof vnode === "object" && vnode !== null) {
    (vnode as any).dom = dom;
  }

  // Also preserve the key if it exists on the old VNode
  if (oldVNode && isElementVNode(oldVNode) && oldVNode.key !== undefined) {
    (vnode as any).key = oldVNode.key;
  }
}

export function updateComponentNode(
  dom: HTMLElement,
  vnode: ComponentVNode,
  oldVNode: VNode | undefined,
  renderComponentFn: RenderComponentFn,
  createDOMNodeFn: CreateDOMNodeFn,
  cleanupNodeFn: (node: Node) => void,
  canUpdateInPlaceFn: (dom: Node, newVNode: VNode, oldVNode?: VNode) => boolean,
  updateDOMNodeFn: UpdateDOMNodeFn,
) {
  const oldRendered = vnodeMetadata.get(dom);

  let existingInstance: SwissComponent | undefined = (vnode as any)
    .__componentInstance;
  if (!(existingInstance && existingInstance.constructor === vnode.type)) {
    existingInstance = undefined;
  }

  if (!existingInstance) {
    const direct = componentInstances.get(dom);
    if (direct && direct.constructor === vnode.type) {
      existingInstance = direct;
    }
  }

  if (!existingInstance && oldVNode && isComponentVNode(oldVNode)) {
    const fromOld = (oldVNode as any).__componentInstance;
    if (fromOld && fromOld.constructor === vnode.type) {
      existingInstance = fromOld;
    }
  }

  if (!existingInstance && oldRendered) {
    const fromRendered = (oldRendered as any).__componentInstance;
    if (fromRendered && fromRendered.constructor === vnode.type) {
      existingInstance = fromRendered;
    }
  }

  if (existingInstance && existingInstance.constructor === vnode.type) {
    (existingInstance as any)._initialized = true;
    (existingInstance as any).__initialized = true;
    if (vnode.props) {
      existingInstance.props = vnode.props;
    }
    clearRenderCache(existingInstance);

    if (typeof vnode === "object" && vnode !== null) {
      (vnode as any).__componentInstance = existingInstance;
      (vnode as any).dom = dom;
    }

    const preservedDomNode = (existingInstance as any)._domNode || dom;
    const newRendered = renderComponentFn(vnode, existingInstance);
    const newInstance =
      newRendered && typeof newRendered === "object" && newRendered !== null
        ? (newRendered as any).__componentInstance
        : undefined;
    if (newInstance) {
      componentInstances.set(dom, newInstance);
      if (typeof vnode === "object" && vnode !== null) {
        (vnode as any).__componentInstance = newInstance;
      }
      if (newInstance._vnode) {
        (newInstance._vnode as any).dom = dom;
      }
      (newInstance as any)._domNode = preservedDomNode || dom;
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
    return;
  }

  if (oldVNode && isComponentVNode(oldVNode) && oldVNode.type === vnode.type) {
    if (existingInstance && typeof vnode === "object" && vnode !== null) {
      (vnode as any).__componentInstance = existingInstance;
    }

    // CRITICAL FIX: Preserve DOM reference from oldVNode IMMEDIATELY
    // This ensures the new VNode knows it owns the existing DOM element
    if (typeof vnode === "object" && vnode !== null) {
      (vnode as any).dom = (oldVNode as any).dom || dom;
    }

    const preservedDomNode = existingInstance
      ? (existingInstance as any)._domNode || dom
      : dom;

    if (existingInstance) {
      if (vnode.props) {
        existingInstance.props = vnode.props;
      }
      clearRenderCache(existingInstance);
    }
    const newRendered = renderComponentFn(vnode, existingInstance);

    const newInstance =
      newRendered && typeof newRendered === "object" && newRendered !== null
        ? (newRendered as any).__componentInstance
        : undefined;
    if (newInstance) {
      componentInstances.set(dom, newInstance);
      if (typeof vnode === "object" && vnode !== null) {
        (vnode as any).__componentInstance = newInstance;
      }
      if (newInstance._vnode) {
        (newInstance._vnode as any).dom = dom;
      }
      (newInstance as any)._domNode = preservedDomNode || dom;
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
    return;
  } else {
    // Component types don't match (e.g., LoginPage → ForgotPasswordPage)
    // Still try to transfer DOM references from old tree to preserve nested components
    const newRendered = renderComponentFn(vnode);

    // CRITICAL FIX: Even when parent component types differ, transfer DOM references
    // from the old rendered tree to the new one. This allows nested components
    // (Stack, Card, Input, Button) to be reused across page changes.
    // We search the old DOM tree for matching component types and transfer their references
    if (
      newRendered &&
      oldRendered &&
      typeof newRendered === "object" &&
      newRendered !== null
    ) {
      // Transfer references before creating new DOM - this allows reconciliation to find existing components
      transferDOMReferencesFromOldTree(newRendered, oldRendered, dom);
    }

    applyRenderedOutput(
      dom,
      vnode,
      oldRendered as VNode | undefined,
      newRendered as VNode,
      renderComponentFn,
      createDOMNodeFn,
      cleanupNodeFn,
      canUpdateInPlaceFn,
      updateDOMNodeFn,
    );
  }
}
