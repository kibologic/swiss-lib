/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mount / unmount / SSR lifecycle methods for SwissComponent.
 *
 * This module is extracted from component.ts to keep both files within the
 * 700-line hard limit. It is not part of the public API — its functions are
 * called exclusively by SwissComponent.
 *
 * Functions exported here:
 *   mountComponent     — first-render into a container element
 *   unmountComponent   — teardown, effect cleanup, DOM removal
 *   bindEventHandlers  — wire @Event decorator handlers after mount
 */

import { untrack } from "../reactivity/effect.js";
import { reactive } from "../reactivity/reactive.js";
import { cleanupContextSubscriptions } from "./context.js";
import {
  getDevtoolsBridge,
  isDevtoolsEnabled,
} from "../devtools/bridge.js";
import { CapabilityManager } from "../security/capability-manager.js";
import { logger } from "../utils/logger.js";
import type { SwissComponent } from "./component.js";

// ─── mountComponent ───────────────────────────────────────────────────────────

/**
 * Performs the initial render into `container` and fires lifecycle hooks.
 * Called by SwissComponent.mount().
 */
export function mountComponent(
  self: SwissComponent,
  container: HTMLElement,
): void {
  if ((self as any)._isMounted) return;
  if (!container || !(container instanceof HTMLElement)) {
    logger.error(
      `mount() called for ${self.constructor.name} with invalid container:`,
      container,
    );
    return;
  }

  (self as any)._container = container;

  // Prevent the initial render effect from committing DOM until beforeMount has fired.
  (self as any)._mounting = true;

  // Initialize reactivity BEFORE any DOM commit. The render effect will execute immediately.
  (self as any).initialize();
  (self as any).executeHookPhase("beforeMount");

  // Allow commits now that beforeMount has run.
  (self as any)._mounting = false;

  // Perform the first DOM commit explicitly (reactivity is now established for subsequent updates).
  untrack(() => {
    const vnode = (self as any).safeRender();
    if (vnode !== null) (self as any).commitVNode(vnode);
  });

  (self as any)._isMounted = true;
  bindEventHandlers(self);
  (self as any).executeHookPhase("mounted");

  if (isDevtoolsEnabled()) {
    try {
      const parentId =
        (self as any)._parent?.["_devtoolsId"] ?? null;
      const consumes =
        (self.constructor as typeof SwissComponent).requires ?? [];
      const provides = CapabilityManager.getProvidedCapabilities(
        self.constructor as typeof SwissComponent,
      );
      getDevtoolsBridge().onComponentMount({
        id: (self as any)._devtoolsId,
        name: self.constructor.name,
        parentId,
        provides,
        consumes,
      });
      try {
        getDevtoolsBridge().recordEvent({
          t: Date.now(),
          type: "mount",
          msg: (self as any)._devtoolsId,
        });
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }
}

// ─── unmountComponent ─────────────────────────────────────────────────────────

/**
 * Tears down the component: cleans up effects, context subscriptions,
 * removes the DOM node, and fires lifecycle hooks.
 * Called by SwissComponent.unmountComponent().
 */
export function unmountComponent(self: SwissComponent): void {
  if (!(self as any)._isMounted) return;

  try {
    (self as any).executeHookPhase("beforeUnmount");
    if (isDevtoolsEnabled()) {
      try {
        getDevtoolsBridge().onComponentUnmount((self as any)._devtoolsId);
      } catch {
        /* ignore */
      }
    }
    cleanupContextSubscriptions(self);
    (self as any).clearEffects();
    (self as any).capabilityManager.clearCache();
    (self as any)._children = [];
    (self as any)._parent = null;

    if ((self as any)._container?.parentNode) {
      (self as any)._container.parentNode.removeChild(
        (self as any)._container,
      );
    }

    (self as any)._portals.forEach(
      (_: unknown, portalContainer: HTMLElement) => {
        if (portalContainer && portalContainer.innerHTML !== undefined)
          portalContainer.innerHTML = "";
      },
    );

    (self as any)._hooks = [];
    // Swiss syntax: unmount { } compiles to private unmounted() { } — call it before teardown
    if (typeof (self as any).unmounted === "function") {
      try {
        (self as any).unmounted();
      } catch (error) {
        console.error(
          `[Component] Error in unmounted() for ${self.constructor.name}:`,
          error,
        );
      }
    }
    (self as any).executeHookPhase("unmounted");
    (self as any).state = reactive({}) as any;
    (self as any)._isMounted = false;
  } catch (error) {
    (self as any).captureError(error, "destroy");
  }
}

// ─── bindEventHandlers ────────────────────────────────────────────────────────

/**
 * Wires up @Event decorator handlers after the component has mounted.
 * Called once by mountComponent() after the first DOM commit.
 */
export function bindEventHandlers(self: SwissComponent): void {
  const eventHandlers = (self as any)._swissEventHandlers as
    | Array<{
        eventType: string;
        method: string;
        selector?: string;
        options: {
          capture?: boolean;
          once?: boolean;
          passive?: boolean;
          preventDefault?: boolean;
          stopPropagation?: boolean;
          capability?: string;
        };
      }>
    | undefined;

  if (!eventHandlers || !(self as any)._container) return;

  for (const handler of eventHandlers) {
    const method = (self as any)[handler.method];
    if (typeof method !== "function") {
      logger.warn(
        `Event handler method '${handler.method}' not found on ${self.constructor.name}`,
      );
      continue;
    }

    if (
      handler.options.capability &&
      !CapabilityManager.has(handler.options.capability, self)
    ) {
      logger.warn(
        `Missing capability '${handler.options.capability}' for event handler '${handler.method}'`,
      );
      continue;
    }

    const boundHandler = (event: Event) => {
      if (handler.options.preventDefault) {
        event.preventDefault();
      }
      if (handler.options.stopPropagation) {
        event.stopPropagation();
      }

      try {
        (method as (...args: unknown[]) => unknown).call(self, event);
      } catch (error) {
        (self as any).captureError(error, `event:${handler.eventType}`);
      }
    };

    if (handler.selector) {
      const elements = (self as any)._container.querySelectorAll(
        handler.selector,
      );
      elements.forEach((element: Element) => {
        element.addEventListener(handler.eventType, boundHandler, {
          capture: handler.options.capture,
          once: handler.options.once,
          passive: handler.options.passive,
        });
      });
    } else {
      (self as any)._container.addEventListener(
        handler.eventType,
        boundHandler,
        {
          capture: handler.options.capture,
          once: handler.options.once,
          passive: handler.options.passive,
        },
      );
    }
  }
}
