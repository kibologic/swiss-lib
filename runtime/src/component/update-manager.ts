/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { clearRenderCache } from "../renderer/render-cache.js";
import { type VNode } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import type { SwissComponent } from "./component.js";
import { asInternal } from "./internal.js";
import { expandSlots } from "../renderer/component-rendering.js";
import { logger } from "../utils/logger.js";
import { saveFocusState, restoreFocusState } from "./focus-guard.js";
import { isDevtoolsEnabled, getDevtoolsBridge, isTelemetryEnabled } from "../devtools/bridge.js";
import {
  updateRootComponent,
  refreshChildDomNode,
  updateWithDomNode,
  updateChildComponent,
  handleNoUpdatePath,
} from "./update-strategies.js";

function scheduleMicrotask(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

export class UpdateManager {
  private updateScheduled: boolean = false;
  private updateCount: number = 0;
  private lastUpdateTime: number = 0;
  private readonly MAX_UPDATES_PER_SECOND = 60;
  private _throttledHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private component: SwissComponent) {}

  public scheduleUpdate(): void {
    if (this.component._signalCommitPending) {
      logger.reactivity(`${this.component.constructor.name}: scheduleUpdate absorbed — signal commit already pending`);
      return;
    }
    if (!this.updateScheduled) {
      clearRenderCache(this.component);
      this.updateScheduled = true;
      const c = asInternal(this.component);
      const isChildComponent = !c._container && c._domNode && c._domNode instanceof HTMLElement;
      if (isChildComponent) {
        logger.reactivity(`${this.component.constructor.name}: update (immediate, child component)`);
        try {
          this.performUpdate();
        } finally {
          this.updateScheduled = false;
        }
      } else {
        logger.reactivity(`${this.component.constructor.name}: update scheduled`);
        scheduleMicrotask(() => {
          logger.updates(`${this.component.constructor.name}: microtask callback`);
          try {
            this.performUpdate();
          } finally {
            this.updateScheduled = false;
          }
        });
      }
    } else {
      logger.reactivity(`${this.component.constructor.name}: update already scheduled`);
    }
  }

  public performUpdate(): void {
    const focusState = saveFocusState();
    try {
      const c = asInternal(this.component);

      if (c._skipNextUpdate) {
        c._skipNextUpdate = false;
        return;
      }

      const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      if (now - this.lastUpdateTime > 1000) this.updateCount = 0;

      if (this.updateCount >= this.MAX_UPDATES_PER_SECOND) {
        logger.warn(`Update throttled for ${this.component.constructor.name} - too many updates (${this.updateCount}/s). Possible infinite loop.`);
        if (this._throttledHandle === null) {
          const delay = Math.ceil(Math.max(0, 1000 - (now - this.lastUpdateTime))) + 1;
          this._throttledHandle = setTimeout(() => {
            this._throttledHandle = null;
            this.updateCount = 0;
            this.lastUpdateTime = 0;
            this.performUpdate();
          }, delay);
        }
        return;
      }

      this.updateCount++;
      this.lastUpdateTime = now;
      const t0 = now;

      let newVNode = this.component.safeRender();

      const slotContent = c._slotContent;
      if (slotContent && slotContent.size > 0 && newVNode != null && typeof newVNode !== "boolean") {
        const expanded = expandSlots(newVNode, slotContent);
        if (expanded !== null) newVNode = expanded;
      }

      let container = c._container;

      if (!container && c._domNode && c._domNode instanceof HTMLElement) {
        refreshChildDomNode(this.component);
        logger.updates(`${this.component.constructor.name}: using updateWithDomNode (child component)`);
        if (newVNode === null) return;
        updateWithDomNode(this.component, newVNode);
        const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        void this.component.executeHookPhase("updated");
        this.reportUpdateMetrics(t0, t1);
        return;
      }

      const vnode = c._vnode;
      const vnodeBase = typeof vnode === "object" && vnode !== null ? vnode as VNodeBase : null;
      if (!container && vnodeBase?.dom?.parentElement) {
        const domNode = vnodeBase.dom;
        if (domNode instanceof HTMLElement && domNode.parentElement) {
          container = domNode.parentElement as HTMLElement;
          c._container = container;
          logger.updates(`${this.component.constructor.name}: found container from DOM parent`);
        }
      }

      logger.updates(`${this.component.constructor.name}: performUpdate (container=${!!container}, vnode=${!!c._vnode}, dom=${!!c._domNode})`);

      if (newVNode === null) return;

      if (container) {
        updateRootComponent(this.component, container, newVNode);
      } else if (c._domNode) {
        updateWithDomNode(this.component, newVNode);
        return;
      } else if (vnodeBase?.dom) {
        updateChildComponent(this.component, newVNode, container);
      } else {
        handleNoUpdatePath(this.component, newVNode);
        return;
      }

      const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      void this.component.executeHookPhase("updated");
      this.reportUpdateMetrics(t0, t1);
    } catch (error) {
      this.component.captureError(error, "render");
      this.component.scheduleUpdate?.();
    } finally {
      restoreFocusState(focusState);
    }
  }

  private reportUpdateMetrics(t0: number, t1: number): void {
    if (!isDevtoolsEnabled()) return;
    try {
      const bridge = getDevtoolsBridge();
      const ms = Math.max(0, t1 - t0);
      const devtoolsId = asInternal(this.component)._devtoolsId;
      let stateSummary: Record<string, unknown> | undefined;
      try { stateSummary = { ...(this.component.state as unknown as Record<string, unknown>) }; } catch { stateSummary = undefined; }
      try { bridge.onComponentUpdate({ id: devtoolsId, stateSummary }); } catch { /* ignore */ }
      try { bridge.recordEvent({ t: Date.now(), type: "render", msg: `${devtoolsId}:${ms}` }); } catch { /* ignore */ }
      if (isTelemetryEnabled() && bridge.recordEventTyped) {
        try { bridge.recordEventTyped({ t: Date.now(), category: "perf", name: "render", componentId: devtoolsId, data: { durationMs: ms } }); } catch { /* ignore */ }
      }
    } catch (error) {
      logger.warn("Error reporting to devtools:", error instanceof Error ? error.message : error);
    }
  }
}
