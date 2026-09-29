/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from "../component/component.js";
import type { VNode } from "../vdom/vdom.js";

// Memory-efficient metadata storage
export const vnodeMetadata = new WeakMap<Node, VNode>();
export const eventListeners = new WeakMap<Element, Map<string, EventListener>>();
export const originalHandlers = new WeakMap<Element, Map<string, EventListener>>(); // Store original handlers for comparison
export const componentInstances = new WeakMap<Node, SwissComponent>();
/** When a component renders a single child component, that child's root DOM is stored here as the "host" for parent reconciliation (root update). */
export const domToHostComponent = new WeakMap<Node, SwissComponent>();
// CRITICAL: Map containers to root component instances
// This allows us to find root component instances even when DOM structure changes
export const containerToInstance = new WeakMap<HTMLElement, SwissComponent>();

// Component instance context for slot handling
let currentComponentInstance: SwissComponent | undefined = undefined;

export function getCurrentComponentInstance(): SwissComponent | undefined {
  return currentComponentInstance;
}

export function setCurrentComponentInstance(instance: SwissComponent | undefined): void {
  currentComponentInstance = instance;
}


// Sibling-claim tracking (FRAME-component-list-sibling-instance-steal). While a reconcileChildren
// pass runs, every DOM node it has already matched/created for a new child is "claimed" by that
// pass. The instance searches in dom-creation.ts must never hand a claimed node's instance to a
// DIFFERENT new child: an instance can back exactly one vnode, so two new siblings sharing it
// collapse onto one DOM node and all but the last silently vanish.
const activeClaimSets = new Set<Set<Node>>();

export function beginClaimScope(claimed: Set<Node>): void {
  activeClaimSets.add(claimed);
}

export function endClaimScope(claimed: Set<Node>): void {
  activeClaimSets.delete(claimed);
}

export function isDomClaimed(node: Node): boolean {
  for (const set of activeClaimSets) {
    if (set.has(node)) return true;
  }
  return false;
}

// A subtree the reconciler creates for a position that matched NO old child is brand new by
// definition. createDOMNode's live-DOM instance search (meant to recover an instance for a
// vnode that lost its dom reference) must not run for it: with no positional match, the only
// thing it can find is a same-type instance that belongs to a DIFFERENT, still-live position
// (another table row's chip, the previous route's Button), which it would then rip out and
// re-home. Nested creation inherits the scope.
let freshMountDepth = 0;

export function beginFreshMount(): void {
  freshMountDepth++;
}

export function endFreshMount(): void {
  freshMountDepth--;
}

export function isFreshMount(): boolean {
  return freshMountDepth > 0;
}
