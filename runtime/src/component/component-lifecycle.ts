/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
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
import { asInternal } from "./internal.js";

// ─── mountComponent ───────────────────────────────────────────────────────────

export function mountComponent(
  self: SwissComponent,
  container: HTMLElement,
): void {
  const c = asInternal(self);
  if (c._isMounted) return;
  if (!container || !(container instanceof HTMLElement)) {
    logger.error(
      `mount() called for ${self.constructor.name} with invalid container:`,
      container,
    );
    return;
  }

  c._container = container;
  c._mounting = true;

  c.initialize();
  void c.executeHookPhase("beforeMount");

  c._mounting = false;

  untrack(() => {
    const vnode = c.safeRender();
    if (vnode !== null) c.commitVNode(vnode);
  });

  c._isMounted = true;
  bindEventHandlers(self);
  void c.executeHookPhase("mounted");

  if (isDevtoolsEnabled()) {
    try {
      const parentId = c._parent ? asInternal(c._parent)._devtoolsId : null;
      const consumes =
        (self.constructor as typeof SwissComponent).requires ?? [];
      const provides = CapabilityManager.getProvidedCapabilities(
        self.constructor as typeof SwissComponent,
      );
      getDevtoolsBridge().onComponentMount({
        id: c._devtoolsId,
        name: self.constructor.name,
        parentId,
        provides,
        consumes,
      });
      try {
        getDevtoolsBridge().recordEvent({
          t: Date.now(),
          type: "mount",
          msg: c._devtoolsId,
        });
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }
}

// ─── unmountComponent ─────────────────────────────────────────────────────────

export function unmountComponent(self: SwissComponent): void {
  const c = asInternal(self);
  if (!c._isMounted) return;

  try {
    void c.executeHookPhase("beforeUnmount");
    if (isDevtoolsEnabled()) {
      try {
        getDevtoolsBridge().onComponentUnmount(c._devtoolsId);
      } catch { /* ignore */ }
    }
    cleanupContextSubscriptions(self);
    c.clearEffects();
    c.clearCapabilityCache();
    c._children = [];
    c._parent = null;

    if (c._container?.parentNode) {
      c._container.parentNode.removeChild(c._container);
    }

    c._portals.forEach((_: unknown, portalContainer: HTMLElement) => {
      if (portalContainer && portalContainer.innerHTML !== undefined) {
        portalContainer.innerHTML = "";
      }
    });

    c._hooks = [];

    if (typeof self.unmounted === "function") {
      try {
        self.unmounted();
      } catch (error) {
        logger.error(`Error in unmounted() for ${self.constructor.name}:`, error);
      }
    }

    void c.executeHookPhase("unmounted");
    c.state = reactive({}) as Record<string, unknown>;
    c._isMounted = false;
  } catch (error) {
    c.captureError(error, "destroy");
  }
}

// ─── bindEventHandlers ────────────────────────────────────────────────────────

export function bindEventHandlers(self: SwissComponent): void {
  const c = asInternal(self);
  const eventHandlers = c._swissEventHandlers;

  if (!eventHandlers || !c._container) return;

  for (const handler of eventHandlers) {
    const method = c[handler.method];
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

    const fn = method as (...args: unknown[]) => unknown;
    const boundHandler = (event: Event) => {
      if (handler.options.preventDefault) event.preventDefault();
      if (handler.options.stopPropagation) event.stopPropagation();
      try {
        fn.call(self, event);
      } catch (error) {
        c.captureError(error, `event:${handler.eventType}`);
      }
    };

    if (handler.selector) {
      const elements = c._container!.querySelectorAll(handler.selector);
      elements.forEach((element: Element) => {
        element.addEventListener(handler.eventType, boundHandler, {
          capture: handler.options.capture,
          once: handler.options.once,
          passive: handler.options.passive,
        });
      });
    } else {
      c._container!.addEventListener(handler.eventType, boundHandler, {
        capture: handler.options.capture,
        once: handler.options.once,
        passive: handler.options.passive,
      });
    }
  }
}
