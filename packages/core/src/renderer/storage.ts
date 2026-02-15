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

