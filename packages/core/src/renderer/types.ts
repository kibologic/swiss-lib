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
  if (isComponentVNode(newVNode) && oldVNode && isComponentVNode(oldVNode)) {
    // Same component type - can update in place
    if (newVNode.type === oldVNode.type) {
      return true;
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

import { eventListeners, vnodeMetadata } from "./storage.js";

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
  }

  vnodeMetadata.delete(node);

  // Clean up children recursively
  Array.from(node.childNodes).forEach(cleanupNode);
}
