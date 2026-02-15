/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { VNode } from "../vdom/vdom.js";

// Development utilities
export const devTools = {
  log(message: string, ...args: unknown[]) {
    if (
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV === "development"
    ) {
      console.log(`[SwissJS] ${message}`, ...args);
    }
  },
  logVNode(vnode: VNode) {
    if (
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV === "development"
    ) {
      console.log("[VDOM]", vnode);
    }
  },
  warn(message: string, vnode?: VNode) {
    if (
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV === "development"
    ) {
      console.warn(`[SwissJS] ${message}`, vnode);
    }
  },
  error(message: string, ...args: unknown[]) {
    if (
      (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
        ?.NODE_ENV === "development"
    ) {
      console.error(`[SwissJS] ${message}`, ...args);
    }
  },
};

// Performance monitoring
export const performanceMonitor = {
  onRenderStart: () => performance.mark("render-start"),
  onRenderEnd: () => {
    performance.mark("render-end");
    performance.measure("render", "render-start", "render-end");
  },
  onHydrationStart: () => performance.mark("hydrate-start"),
  onHydrationEnd: () => {
    performance.mark("hydrate-end");
    performance.measure("hydrate", "hydrate-start", "hydrate-end");
  },
};

