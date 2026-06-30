/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

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
import type { VNodeBase } from "../vdom/types/index.js";
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

function vb(vnode: VNode | null | undefined): VNodeBase | null {
  if (vnode == null || typeof vnode !== "object") return null;
  return vnode as unknown as VNodeBase;
}

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
  const newRenderedBase = vb(newRendered);
  if (newRenderedBase) {
    newRenderedBase.dom = hostDom;
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

  if (typeof newVNode === "object" && newVNode !== null) {
    if (visited.has(newVNode)) return;
    visited.add(newVNode);
  }

  const oldBase = vb(oldVNode as VNode);
  const newBase = vb(newVNode);

  if (oldBase?.dom && newBase) {
    newBase.dom = oldBase.dom;

    if (
      isComponentVNode(newVNode) &&
      isComponentVNode(oldVNode as VNode) &&
      newVNode.type === (oldVNode as ComponentVNode).type
    ) {
      if (oldBase.__componentInstance) {
        newBase.__componentInstance = oldBase.__componentInstance;
      }
    }
  }

  if (isElementVNode(newVNode) && isElementVNode(oldVNode as VNode)) {
    const oldElement = oldVNode as VElement;
    const newChildren = Array.isArray(newVNode.children)
      ? newVNode.children
      : newVNode.children
        ? [newVNode.children]
        : [];
    const oldChildren = Array.isArray(oldElement.children)
      ? oldElement.children
      : oldElement.children
        ? [oldElement.children]
        : [];

    for (let i = 0; i < newChildren.length && i < oldChildren.length; i++) {
      const newChild = newChildren[i];
      const oldChild = oldChildren[i];
      if (newChild && oldChild) {
        let childDom: Node | undefined;
        const oldChildBase = vb(oldChild as VNode);
        if (oldChildBase?.dom) {
          childDom = oldChildBase.dom as Node;
        } else if (domNode instanceof HTMLElement && i < domNode.childNodes.length) {
          childDom = domNode.childNodes[i];
        }

        if (childDom) {
          transferDOMReferencesFromOldTree(
            newChild as VNode,
            oldChild as VNode,
            childDom,
            visited,
          );
        }
      }
    }

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

      for (const newChild of newChildren) {
        if (
          newChild &&
          isComponentVNode(newChild as VNode) &&
          typeof newChild === "object" &&
          newChild !== null
        ) {
          const newChildCV = newChild as ComponentVNode;
          const alreadyMatched = oldChildren.some((oldChild, idx) => {
            if (
              oldChild &&
              isComponentVNode(oldChild as VNode) &&
              (oldChild as ComponentVNode).type === newChildCV.type
            ) {
              const oldChildBase = vb(oldChild as VNode);
              if (
                oldChildBase?.dom &&
                idx < newChildren.length &&
                newChildren[idx] === newChild
              ) {
                return true;
              }
            }
            return false;
          });

          if (!alreadyMatched) {
            const found = searchForMatchingComponent(domNode, newChildCV.type);
            if (found && found.vnode) {
              const newChildBase = vb(newChild as VNode);
              if (newChildBase) {
                newChildBase.__componentInstance = found.instance;
                newChildBase.dom = found.dom;
              }
              transferDOMReferencesFromOldTree(
                newChild as VNode,
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

  if (isComponentVNode(newVNode) && domNode instanceof HTMLElement) {
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

    if (isComponentVNode(oldVNode as VNode) && newVNode.type === (oldVNode as ComponentVNode).type) {
      if (oldBase?.__componentInstance && newBase) {
        newBase.__componentInstance = oldBase.__componentInstance;
      }
    } else {
      const found = searchForMatchingComponent(domNode, newVNode.type);
      if (found && newBase) {
        newBase.__componentInstance = found.instance;
        newBase.dom = found.dom;
      }
    }

    const oldRendered = vnodeMetadata.get(domNode);
    if (oldRendered) {
      const newRendered = newBase?.__rendered;
      if (newRendered && oldRendered) {
        transferDOMReferencesFromOldTree(newRendered, oldRendered, domNode, visited);
      }
    }
  }
}

// ─── propagateDOMReferences ──────────────────────────────────────────────────

/**
 * Propagates DOM references from the actual DOM tree to the VNode tree.
 */
export function propagateDOMReferences(
  vnode: VNode,
  domNode: Node,
  visited: Set<object> = new Set(),
): void {
  if (!vnode || typeof vnode === "boolean") return;

  if (typeof vnode === "object" && vnode !== null) {
    if (visited.has(vnode)) return;
    visited.add(vnode);
  }

  if (isElementVNode(vnode)) {
    vnode.dom = domNode;

    if (vnode.children && domNode instanceof HTMLElement) {
      const children = Array.isArray(vnode.children)
        ? vnode.children
        : [vnode.children];
      const domChildren = Array.from(domNode.childNodes);

      let domChildIndex = 0;
      for (const childVNode of children) {
        if (childVNode == null || typeof childVNode === "boolean") continue;

        let matchingDom: Node | null = null;

        if (isElementVNode(childVNode) && childVNode.props?.id) {
          const id = String(childVNode.props.id);
          for (const child of Array.from(domNode.childNodes)) {
            if (child instanceof HTMLElement) {
              if (child.id === id) {
                matchingDom = child;
                break;
              }
              const found = child.querySelector(`#${CSS.escape(id)}`);
              if (found) {
                matchingDom = found;
                break;
              }
            }
          }
        }

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
            if (candidateDom.nodeType === Node.ELEMENT_NODE) {
              matchingDom = candidateDom;
              domChildIndex++;
              childVNode.dom = matchingDom;
            }
          }
        }

        if (matchingDom && isElementVNode(childVNode)) {
          propagateDOMReferences(childVNode, matchingDom, visited);
        }
      }
    }
  } else if (isComponentVNode(vnode)) {
    vnode.dom = domNode;
  } else if (isTextVNode(vnode)) {
    const vnodeBase = vb(vnode);
    if (vnodeBase && domNode.nodeType === Node.TEXT_NODE) {
      vnodeBase.dom = domNode;
    }
  }
}
