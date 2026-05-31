/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public DOM update entry-points consumed by renderer.ts.
 *
 * Internal reference-propagation helpers live in dom-update-refs.ts so
 * this file stays within the 700-line limit while remaining the single
 * import target for renderer.ts.
 *
 * Exports:
 *   updateDOMNode       — top-level dispatcher; routes to text/element/component updaters
 *   updateTextNode      — updates a Text node's content
 *   updateElementNode   — reconciles props + children for an element VNode
 *   updateComponentNode — re-renders a component VNode into its existing DOM node
 */

import type { SwissComponent } from "../component/component.js";
import type { VNode, VElement, ComponentVNode } from "../vdom/vdom.js";
import {
  isSignal,
  isTextVNode,
  isElementVNode,
  isComponentVNode,
  cleanupNode,
} from "./types.js";
import { DiffingError } from "./errors.js";
import { clearRenderCache } from "./render-cache.js";
import {
  vnodeMetadata,
  componentInstances,
  domToHostComponent,
} from "./storage.js";
import {
  applyRenderedOutput,
  transferDOMReferencesFromOldTree,
} from "./dom-update-refs.js";

// ─── Type aliases ─────────────────────────────────────────────────────────────

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

// ─── updateDOMNode ────────────────────────────────────────────────────────────

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

// ─── updateTextNode ───────────────────────────────────────────────────────────

export function updateTextNode(dom: Text, vnode: string | number) {
  if (dom.textContent !== String(vnode)) {
    dom.textContent = String(vnode);
  }
}

// ─── updateElementNode ────────────────────────────────────────────────────────

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

// ─── updateComponentNode ──────────────────────────────────────────────────────

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
