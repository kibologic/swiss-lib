/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type {
  VNode,
  VElement,
  ComponentVNode,
  ComponentType,
} from "../vdom/vdom.js";
import { Fragment } from "../vdom/vdom.js";
import { Signal } from "../reactivity/signals.js";
import type { SwissComponent } from "../component/component.js";

// Type guards for robust type handling
export function isTextVNode(
  vnode: VNode,
): vnode is Extract<VNode, string | number> {
  return typeof vnode === "string" || typeof vnode === "number";
}

export function isElementVNode(vnode: VNode): vnode is VElement {
  return (
    typeof vnode === "object" &&
    vnode !== null &&
    "type" in vnode &&
    typeof vnode.type === "string"
  );
}

export function isComponentVNode(vnode: VNode): vnode is ComponentVNode {
  return (
    typeof vnode === "object" &&
    vnode !== null &&
    "type" in vnode &&
    typeof vnode.type === "function"
  );
}

export function isFragmentVNode(vnode: VNode): vnode is VElement {
  return (
    Array.isArray(vnode) ||
    (typeof vnode === "object" &&
      vnode !== null &&
      "type" in vnode &&
      ((vnode.type as unknown) === Fragment ||
        (typeof vnode.type === "symbol" &&
          String(vnode.type) === "Symbol(Fragment)")))
  );
}

// Type guard for Signal objects (duck typing for safety)
export function isSignal(value: unknown): value is Signal<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "subscribe" in value &&
    typeof (value as { subscribe: unknown }).subscribe === "function"
  );
}

export function isEventProp(name: string): boolean {
  return name.startsWith("on");
}

export function isClassComponent(
  component: ComponentType,
): component is new (props: Record<string, unknown>) => SwissComponent {
  return (
    typeof component === "function" &&
    component.prototype &&
    typeof component.prototype.render === "function"
  );
}

// Helper functions
export function getKey(vnode: VNode, index: number): string | number {
  if (isTextVNode(vnode)) return `text_${index}`;

  // Check for explicit key on both element and component VNodes (top-level or in props)
  if (typeof vnode === "object" && vnode !== null) {
    const keyedVNode = vnode as { key?: string | number; props?: { key?: string | number } };
    const key = keyedVNode.key ?? keyedVNode.props?.key;
    if (key !== undefined) {
      return key;
    }
  }

  // CRITICAL: For component VNodes without explicit keys, generate a stable key
  // based on component type + index. This prevents unnecessary recreation during reconciliation.
  // Using just the index causes components to be recreated when siblings are added/removed.
  if (isComponentVNode(vnode)) {
    const componentName =
      typeof vnode.type === "function"
        ? vnode.type.name || "Anonymous"
        : "Unknown";
    return `${componentName}_${index}`;
  }

  // CRITICAL: For element VNodes without explicit keys, also use type + index
  // This provides better stability during reconciliation
  if (isElementVNode(vnode)) {
    return `${vnode.type}_${index}`;
  }

  return index;
}

export function canUpdateInPlace(
  dom: Node,
  newVNode: VNode,
  oldVNode?: VNode,
): boolean {
  // CRITICAL: Handle null/undefined vnodes
  if (newVNode == null || typeof newVNode === "boolean") {
    return false;
  }

  if (isTextVNode(newVNode)) {
    return dom.nodeType === Node.TEXT_NODE;
  }

  if (isElementVNode(newVNode)) {
    if (dom.nodeType !== Node.ELEMENT_NODE) return false;

    const element = dom as HTMLElement;
    if (element.tagName.toLowerCase() !== newVNode.type.toLowerCase())
      return false;

    const oldKey =
      oldVNode && isElementVNode(oldVNode) ? oldVNode.key : undefined;
    const newKey = newVNode.key;

    if (oldKey !== undefined && newKey !== undefined) {
      return oldKey === newKey;
    }

    return true;
  }

  // CRITICAL: Component VNodes can update in place if they have the same type
  // This prevents creating new instances during reactive updates
  if (isComponentVNode(newVNode)) {
    // Same component type as the previous vnode at this position - update in place.
    if (oldVNode && isComponentVNode(oldVNode) && newVNode.type === oldVNode.type) {
      return true;
    }

    // FRAME (component-renders-component): a component whose render() returns ANOTHER
    // component directly, with no wrapping element (e.g. ErrorBoundary.renderWithBoundary
    // returning its single child, or any `render() { return <Child/> }`), shares its host
    // DOM node with that child. When applyRenderedOutput reconciles such a component output,
    // the oldVNode it passes is `dom`'s STORED baseline -- and updateDOMNode deliberately
    // never stores a component vnode as a baseline (it stores the grandchild's rendered
    // ELEMENT output instead, see dom-updates.ts). So oldVNode here is that element vnode,
    // the isComponentVNode(oldVNode) check above can never match, and this returns false --
    // making applyRenderedOutput tear down and recreate the entire live subtree on every
    // reactive update. That recreation races the child's own signal-effect commit and ends
    // with the child rendered against emptied props, wiping the subtree (repro:
    // nested-grandchild-prop-through-passthrough-repro.test.ts -- the office study-reader's
    // ErrorBoundary>ReaderEngine>ProseEngine "chapter switch doesn't repaint" bug). The DOM
    // node already hosts a live component subtree, so an in-place update (updateComponentNode
    // finds and reuses that instance) is both correct and what the same-type-vnode branch
    // above already does whenever a component vnode baseline happens to be present -- this
    // just recovers the identical decision from the live instance when the baseline is the
    // child's element output instead. Two ways the type can match:
    //   1. the DOM node's registered owner IS an instance of this exact type (a component
    //      re-rendering directly onto its own node), or
    //   2. the owner is the OUTER component of a component-renders-component pair and its
    //      last render output (owner._vnode) was a component vnode of this exact type -- the
    //      ErrorBoundary>child case, where the shared node's single registration slot holds
    //      the outer (Boundary) while the vnode being reconciled is its child (Mid) output.
    const owner = componentInstances.get(dom) ?? domToHostComponent.get(dom);
    if (owner) {
      if (owner.constructor === newVNode.type) {
        return true;
      }
      const ownerRendered = (owner as unknown as { _vnode?: VNode })._vnode;
      if (
        ownerRendered &&
        isComponentVNode(ownerRendered) &&
        ownerRendered.type === newVNode.type
      ) {
        return true;
      }
    }
  }

  return false;
}

export function filterValidVNodes(children: unknown[]): VNode[] {
  return children.filter(
    (child): child is VNode =>
      child !== null && child !== undefined && typeof child !== "boolean",
  ) as VNode[];
}

import { eventListeners, vnodeMetadata, componentInstances, domToHostComponent } from "./storage.js";
import { asInternal } from "../component/internal.js";
import { logger } from "../utils/logger.js";

export function cleanupNode(node: Node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    const listeners = eventListeners.get(element);

    if (listeners) {
      listeners.forEach((listener, event) => {
        element.removeEventListener(event, listener);
      });
      eventListeners.delete(element);
    }

    // FRAME-006-capability-build-portals-refs: a ref's `.current` is set once, in
    // dom-creation.ts's createElementNode, when the element is first created. Nothing on
    // the removal path ever cleared it -- a Ref object outlived by nothing else in the
    // component would keep `.current` pointing at a detached DOM node indefinitely after
    // its element unmounts, with no way for the app to detect this beyond re-checking
    // `.isConnected` itself, which defeats the point of a ref telling you the element is
    // live. Clear it here, symmetric with where it's set. Read the vnode from
    // vnodeMetadata (still populated at this point, this function deletes it below) rather
    // than from the DOM, since props are a vnode-level concept.
    const vnode = vnodeMetadata.get(node);
    const refProp = vnode && typeof vnode === "object" && "props" in vnode
      ? (vnode as { props?: Record<string, unknown> }).props?.ref
      : undefined;
    if (refProp !== null && typeof refProp === "object" && "current" in refProp) {
      const ref = refProp as { current: unknown };
      // Only clear if it's still pointing at THIS element -- a ref reassigned to a newer
      // element by the time this cleanup runs (e.g. rapid remount) must not be clobbered.
      if (ref.current === element) {
        ref.current = null;
      }
    }

    // Invoke unmount lifecycle before removing the instance from the registry
    const instance = componentInstances.get(element);
    if (instance) {
      const ci = asInternal(instance);
      if (typeof ci.unmountComponent === "function") {
        try {
          ci.unmountComponent();
        } catch (e) {
          logger.warn(`[SwissJS] Error during unmount cleanup:`, e);
        }
      }
      componentInstances.delete(element);
    }
  }

  vnodeMetadata.delete(node);

  // Clean up children recursively
  Array.from(node.childNodes).forEach(cleanupNode);
}
