/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

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
import type { VNodeBase } from "../vdom/types/index.js";
import { asInternal } from "../component/internal.js";
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
      const oldChildBase = typeof oldChild === "object" && oldChild !== null
        ? (oldChild as unknown as VNodeBase)
        : null;
      if (oldChildBase?.dom) return;

      // Try to restore from metadata first
      if (index < domChildren.length) {
        const childDom = domChildren[index];
        const metadataVNode = vnodeMetadata.get(childDom);
        if (metadataVNode && oldChildBase) {
          if (
            isComponentVNode(oldChild) &&
            isComponentVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            oldChild.dom = childDom;
            return;
          }
          if (
            isElementVNode(oldChild) &&
            isElementVNode(metadataVNode) &&
            oldChild.type === metadataVNode.type
          ) {
            oldChild.dom = childDom;
            return;
          }
        }

        // Fallback: match by type and position
        if (isElementVNode(oldChild) && childDom instanceof HTMLElement) {
          if (childDom.tagName.toLowerCase() === oldChild.type.toLowerCase()) {
            oldChild.dom = childDom;
          }
        } else if (isComponentVNode(oldChild) && childDom instanceof HTMLElement) {
          const direct = componentInstances.get(childDom);
          const host = domToHostComponent.get(childDom);
          const instance =
            (host && host.constructor === oldChild.type ? host : null) ||
            (direct && direct.constructor === oldChild.type ? direct : null);
          if (instance) {
            oldChild.dom = childDom;
            oldChild.__componentInstance = instance;
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
    const newChildBase = typeof newChild === "object" && newChild !== null
      ? (newChild as unknown as VNodeBase)
      : null;
    if (newChildBase?.dom) return;
    if (i >= domChildren.length) return;
    const childDom = domChildren[i];
    if (isComponentVNode(newChild) && childDom instanceof HTMLElement) {
      const direct = componentInstances.get(childDom);
      const host = domToHostComponent.get(childDom);
      const instance =
        (host && host.constructor === newChild.type ? host : null) ||
        (direct && direct.constructor === newChild.type ? direct : null);
      if (instance) {
        newChild.dom = childDom;
        newChild.__componentInstance = instance;
      }
    } else if (isElementVNode(newChild) && childDom instanceof HTMLElement) {
      if (
        childDom.nodeType === Node.ELEMENT_NODE &&
        childDom.tagName.toLowerCase() === newChild.type.toLowerCase()
      ) {
        newChild.dom = childDom;
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

  vnode.dom = dom;

  if (oldVNode && isElementVNode(oldVNode) && oldVNode.key !== undefined) {
    vnode.key = oldVNode.key;
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

  let existingInstance: SwissComponent | undefined = vnode.__componentInstance;
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
    const fromOld = oldVNode.__componentInstance;
    if (fromOld && fromOld.constructor === vnode.type) {
      existingInstance = fromOld;
    }
  }

  if (!existingInstance && oldRendered) {
    const fromRendered = (oldRendered as unknown as VNodeBase).__componentInstance;
    if (fromRendered && fromRendered.constructor === vnode.type) {
      existingInstance = fromRendered;
    }
  }

  if (existingInstance && existingInstance.constructor === vnode.type) {
    const eci = asInternal(existingInstance);
    eci._initialized = true;
    eci.__initialized = true;
    if (vnode.props) {
      existingInstance.props = vnode.props;
    }
    clearRenderCache(existingInstance);

    vnode.__componentInstance = existingInstance;
    vnode.dom = dom;

    const preservedDomNode = eci._domNode || dom;
    const newRendered = renderComponentFn(vnode, existingInstance);
    const newInstance = (newRendered as unknown as VNodeBase | null)?.__componentInstance;
    if (newInstance) {
      const nci = asInternal(newInstance);
      componentInstances.set(dom, newInstance);
      vnode.__componentInstance = newInstance;
      const oldVNodeBase = nci._vnode as unknown as VNodeBase | null;
      if (oldVNodeBase) oldVNodeBase.dom = dom;
      nci._domNode = preservedDomNode || dom;
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
    if (existingInstance) {
      vnode.__componentInstance = existingInstance;
    }

    vnode.dom = oldVNode.dom || dom;

    const preservedDomNode = existingInstance
      ? asInternal(existingInstance)._domNode || dom
      : dom;

    if (existingInstance) {
      if (vnode.props) {
        existingInstance.props = vnode.props;
      }
      clearRenderCache(existingInstance);
    }
    const newRendered = renderComponentFn(vnode, existingInstance);

    const newInstance = (newRendered as unknown as VNodeBase | null)?.__componentInstance;
    if (newInstance) {
      const nci = asInternal(newInstance);
      componentInstances.set(dom, newInstance);
      vnode.__componentInstance = newInstance;
      const oldVNodeBase = nci._vnode as unknown as VNodeBase | null;
      if (oldVNodeBase) oldVNodeBase.dom = dom;
      nci._domNode = preservedDomNode || dom;
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
