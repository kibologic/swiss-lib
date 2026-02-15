/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { domToHostComponent, componentInstances } from "../renderer/storage.js";
import { reconcileProps } from "../renderer/props-updates.js";
import { clearRenderCache } from "../renderer/render-cache.js";
import { type VNode } from "../vdom/vdom.js";
import { untrack } from "../reactivity/effect.js";
import type { SwissComponent } from "./component.js";
import { expandSlots } from "../renderer/component-rendering.js";
import { logger } from "../utils/logger.js";

/**
 * Manages component updates and DOM reconciliation
 */
export class UpdateManager {
  private updateScheduled: boolean = false;
  private updateCount: number = 0;
  private lastUpdateTime: number = 0;
  private readonly MAX_UPDATES_PER_SECOND = 60; // Prevent infinite loops

  constructor(private component: SwissComponent) {}

  /**
   * Schedules an update. Uses immediate run for child components (no container, have _domNode) so toggles feel instant.
   */
  public scheduleUpdate(): void {
    if (!this.updateScheduled) {
      clearRenderCache(this.component);
      this.updateScheduled = true;
      const c = this.component as any;
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
        requestAnimationFrame(() => {
          logger.updates(`${this.component.constructor.name}: rAF callback`);
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

  /**
   * Performs the actual component update
   */
  public performUpdate(): void {
    try {
      if (typeof window !== "undefined") {
        const c = this.component as any;
        console.log(`[Swiss] ${this.component.constructor.name}.performUpdate() container=${!!c._container} vnode=${!!c._vnode} dom=${!!c._domNode}`);
      }
      // Skip first update for components just created in createDOMNode (DOM already correct)
      if ((this.component as any)._skipNextUpdate) {
        (this.component as any)._skipNextUpdate = false;
        return;
      }

      // CRITICAL: Prevent infinite re-render loops
      const now = typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
      
      // Reset counter if more than 1 second has passed
      if (now - this.lastUpdateTime > 1000) {
        this.updateCount = 0;
      }
      
      // Throttle updates to prevent infinite loops
      if (this.updateCount >= this.MAX_UPDATES_PER_SECOND) {
        logger.warn(
          `Update throttled for ${this.component.constructor.name} - too many updates (${this.updateCount}/s). Possible infinite loop.`,
        );
        return;
      }
      
      this.updateCount++;
      this.lastUpdateTime = now;
      
      const t0 = now;

      // Always render to track dependencies
      let newVNode = this.component.safeRender();

      // CRITICAL: Expand slots in the rendered output using the instance's _slotContent
      // This must happen here because updateDOMNode won't expand slots for VElements
      // The _slotContent is set during renderComponent and contains the original children
      const slotContent = (this.component as any)._slotContent as
        | Map<string, VNode[]>
        | undefined;
      if (
        slotContent &&
        slotContent.size > 0 &&
        newVNode != null &&
        typeof newVNode !== "boolean"
      ) {
        const expanded = expandSlots(newVNode, slotContent);
        if (expanded !== null) {
          newVNode = expanded;
        }
      }

      // Try to find container from multiple sources
      let container = (this.component as any)._container;

      // Child components (ForgePanel, ControlDeck, etc.): when we have no container but have _domNode, patch our root via updateWithDomNode.
      // First refresh _domNode from the live DOM so we never patch a detached node (fixes Forge/terminal not responding or only on 3rd click).
      if (
        !container &&
        (this.component as any)._domNode &&
        (this.component as any)._domNode instanceof HTMLElement
      ) {
        this.refreshChildDomNode();
        logger.updates(`${this.component.constructor.name}: using updateWithDomNode (child component)`);
        this.updateWithDomNode(newVNode);
        const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
        this.component.executeHookPhase("updated");
        this.reportUpdateMetrics(t0, t1);
        return;
      }

      // If no container yet, try from the old VNode's DOM node
      if (
        !container &&
        (this.component as any)._vnode &&
        ((this.component as any)._vnode as any).dom
      ) {
        const domNode = ((this.component as any)._vnode as any).dom;
        if (domNode instanceof HTMLElement && domNode.parentElement) {
          container = domNode.parentElement as HTMLElement;
          (this.component as any)._container = container;
          logger.updates(`${this.component.constructor.name}: found container from DOM parent`);
        }
      }

      // CRITICAL: Check _domNode as well - it might be set by renderer even if _vnode is not set yet
      const hasDomNode = !!(this.component as any)._domNode;
      const vnodeHasDom = !!(
        (this.component as any)._vnode &&
        ((this.component as any)._vnode as any).dom
      );

      logger.updates(
        `${this.component.constructor.name}: performUpdate (container=${!!container}, vnode=${!!(this.component as any)._vnode}, dom=${hasDomNode})`,
      );

      if (container) {
        this.updateRootComponent(container, newVNode);
      } else if ((this.component as any)._domNode) {
        this.updateWithDomNode(newVNode);
        return;
      } else if (
        (this.component as any)._vnode &&
        ((this.component as any)._vnode as any).dom
      ) {
        this.updateChildComponent(newVNode, container);
      } else {
        this.handleNoUpdatePath(newVNode);
        return;
      }

      const t1 =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();

      this.component.executeHookPhase("updated");
      this.reportUpdateMetrics(t0, t1);
    } catch (error) {
      this.component.captureError(error, "render");
      // Schedule a follow-up update so the component re-renders with the error fallback UI
      this.component.scheduleUpdate?.();
    }
  }

  private updateRootComponent(container: HTMLElement, newVNode: VNode): void {
    const oldVNode = (this.component as any)._vnode;
    logger.updates(`${this.component.constructor.name}: root update (container, oldVNode=${!!oldVNode})`);

    if ((this.component as any)._container !== container) {
      (this.component as any)._container = container;
    }

    if (
      typeof newVNode === "object" &&
      newVNode !== null &&
      "type" in newVNode &&
      typeof newVNode.type === "function"
    ) {
      (newVNode as any).__componentInstance = this.component;
    }

    // CRITICAL: Check if we need to replace container content
    // This happens when the root component's structure changes significantly
    // (e.g., from "Loading..." div to actual app content)
    const oldDom = oldVNode && (oldVNode as any).dom;
    const isOldDomDirectChild = oldDom && oldDom.parentElement === container;
    
    // CRITICAL: Only replace container if:
    // 1. No old DOM exists (initial render) AND container is empty
    // 2. Old DOM exists but is NOT a direct child (structure changed externally)
    // DO NOT replace if old DOM is a direct child - use updateDOMNode instead
    // This prevents infinite re-render loops where container content is replaced unnecessarily
    const shouldReplaceContainer = 
      (!oldDom && !container.firstChild) || // Initial render, empty container
      (oldDom && !isOldDomDirectChild && container.firstChild && container.firstChild !== oldDom); // Structure changed externally

    if (shouldReplaceContainer && oldVNode) {
      logger.updates(`${this.component.constructor.name}: root structure changed, replacing container`);
      untrack(() => {
        if (container && container instanceof HTMLElement) renderToDOM(newVNode, container);
        if (container && container.firstChild) {
          (this.component as any)._domNode = container.firstChild;
          (newVNode as any).dom = container.firstChild;
        }
      });
    } else if (oldVNode && (oldVNode as any).dom) {
      // Update existing DOM
      // CRITICAL: Before updateDOMNode, bind root's existing DOM children to new VNode children by position.
      // Ensures root update (e.g. App → div.erp-root → EventBusProvider) reuses DOM and does not clear content.
      const rootDom = (oldVNode as any).dom as HTMLElement;
      let rootHasBoundChildren = false;
      if (
        rootDom &&
        rootDom.childNodes &&
        newVNode &&
        typeof newVNode === "object" &&
        newVNode !== null &&
        "type" in newVNode &&
        typeof (newVNode as any).type === "string"
      ) {
        const raw = (newVNode as any).children;
        const newChildren: VNode[] = Array.isArray(raw)
          ? raw
          : raw != null && typeof raw !== "boolean"
            ? [raw]
            : [];
        const domChildren = Array.from(rootDom.childNodes);
        for (let i = 0; i < newChildren.length && i < domChildren.length; i++) {
          const nc = newChildren[i];
          const childDom = domChildren[i];
          if (
            nc &&
            typeof nc === "object" &&
            nc !== null &&
            childDom &&
            childDom instanceof HTMLElement
          ) {
            const direct = componentInstances.get(childDom);
            const host = domToHostComponent.get(childDom);
            const type = (nc as any).type;
            const instance =
              (host && typeof type === "function" && host.constructor === type
                ? host
                : null) ||
              (direct &&
              typeof type === "function" &&
              direct.constructor === type
                ? direct
                : null);
            (nc as any).dom = childDom;
            if (instance) {
              (nc as any).__componentInstance = instance;
              rootHasBoundChildren = true;
              // Force child to re-render with new props when root updates (fixes controlled Forge/Terminal not reflecting state)
              clearRenderCache(instance);
            }
          }
        }
      }
      // When root already has DOM children and we bound them above, still update root props
      // (e.g. class) then run full updateDOMNode so child components get new props (e.g. AppNavSidebar open/closed).
      const rootAlreadyHasContent =
        rootDom &&
        rootDom.childNodes &&
        rootDom.childNodes.length > 0;
      const oldProps = (oldVNode as any).props ?? {};
      const newProps = (newVNode as any).props ?? {};
      if (rootAlreadyHasContent && rootHasBoundChildren) {
        reconcileProps(rootDom, oldProps, newProps);
        // Fall through to updateDOMNode so children (Header, AppNavSidebar, etc.) are updated.
      }
      untrack(() => {
        updateDOMNode((oldVNode as any).dom, newVNode);
        (newVNode as any).dom = (oldVNode as any).dom;
        (this.component as any)._domNode = (oldVNode as any).dom;
      });
      logger.updates(`${this.component.constructor.name}: updateDOMNode completed`);
    } else {
      // Initial render
      if (!container || !(container instanceof HTMLElement)) {
        logger.warn(`Skipping renderToDOM for ${this.component.constructor.name}: container invalid`);
        (this.component as any)._vnode = newVNode;
        return;
      }
      logger.updates(`${this.component.constructor.name}: renderToDOM (initial)`);
      untrack(() => {
        renderToDOM(newVNode, container);
        if (container.firstChild && !(this.component as any)._domNode) {
          (this.component as any)._domNode = container.firstChild;
        }
      });
    }

    (this.component as any)._vnode = newVNode;
    // Preserve dom reference on new VNode
    if (oldVNode && (oldVNode as any).dom && !shouldReplaceContainer) {
      (newVNode as any).dom = (oldVNode as any).dom;
    } else if ((this.component as any)._domNode) {
      (newVNode as any).dom = (this.component as any)._domNode;
    }
  }

  /**
   * Ensure _domNode points at this component's live root in the document.
   * Scans parent's direct children first, then entire app subtree so we always find the node.
   */
  private refreshChildDomNode(): void {
    const c = this.component as any;
    const current = c._domNode;
    let parent: HTMLElement | null =
      c._container ?? (current?.parentElement ?? null) ?? (c._vnode?.dom?.parentElement ?? null);

    const findIn = (root: HTMLElement): boolean => {
      for (let i = 0; i < root.children.length; i++) {
        const el = root.children[i];
        if (!(el instanceof HTMLElement)) continue;
        const instance = componentInstances.get(el) ?? domToHostComponent.get(el);
        if (instance === this.component) {
          if (el !== current) {
            c._domNode = el;
            c._container = root;
            if (c._vnode && typeof c._vnode === "object") (c._vnode as any).dom = el;
            logger.updates(`${this.component.constructor.name}: refreshed _domNode from live DOM`);
          }
          return true;
        }
        if (findIn(el)) return true;
      }
      return false;
    };

    if (parent && parent instanceof HTMLElement && findIn(parent)) return;

    const app = typeof document !== "undefined" ? document.querySelector("#app") : null;
    if (app && app instanceof HTMLElement && app.firstElementChild instanceof HTMLElement) {
      findIn(app.firstElementChild);
    }
  }

  private updateWithDomNode(newVNode: VNode): void {
    const domNode = (this.component as any)._domNode;
    logger.updates(`${this.component.constructor.name}: update via _domNode`);

    // Store instance on new VNode for renderer
    if (
      typeof newVNode === "object" &&
      newVNode !== null &&
      "type" in newVNode &&
      typeof newVNode.type === "function"
    ) {
      (newVNode as any).__componentInstance = this.component;
    }

    // Update the DOM node with untrack
    untrack(() => {
      updateDOMNode(domNode, newVNode);
      (this.component as any)._vnode = newVNode;
      (newVNode as any).dom = domNode;
      (this.component as any)._domNode = domNode;
    });
    logger.updates(`${this.component.constructor.name}: updated ( _domNode )`);
  }

  private updateChildComponent(
    newVNode: VNode,
    container: HTMLElement | null,
  ): void {
    const domNode = ((this.component as any)._vnode as any).dom;

    // CRITICAL: Store instance on VNode BEFORE any DOM operations
    if (
      typeof newVNode === "object" &&
      newVNode !== null &&
      "type" in newVNode &&
      typeof newVNode.type === "function"
    ) {
      (newVNode as any).__componentInstance = this.component;
    }

    // Try to recover container from DOM node's parent
    if (!container && domNode instanceof HTMLElement && domNode.parentElement) {
      const parent = domNode.parentElement;
      if (
        parent.children.length === 1 ||
        parent.id === "app" ||
        parent.classList.contains("app-root")
      ) {
        container = parent;
        (this.component as any)._container = container;
        const oldVNode = (this.component as any)._vnode;
        untrack(() => {
          if (oldVNode && (oldVNode as any).dom) {
            logger.updates(`${this.component.constructor.name}: updateDOMNode (recovered root)`);
            updateDOMNode((oldVNode as any).dom, newVNode);
            (newVNode as any).dom = (oldVNode as any).dom;
          } else {
            if (container != null && container instanceof HTMLElement) {
              renderToDOM(newVNode, container);
            } else {
              updateDOMNode(domNode, newVNode);
              (newVNode as any).dom = domNode;
            }
          }
        });
        (this.component as any)._vnode = newVNode;
        if (oldVNode && (oldVNode as any).dom) {
          (newVNode as any).dom = (oldVNode as any).dom;
        }
        if ((this.component as any)._domNode !== domNode) {
          (this.component as any)._domNode = domNode;
        }
        return;
      }
    }

    logger.updates(`${this.component.constructor.name}: child update, updateDOMNode()`);
    untrack(() => {
      updateDOMNode(domNode, newVNode);
      (this.component as any)._vnode = newVNode;
      (newVNode as any).dom = domNode;
      if ((this.component as any)._domNode !== domNode) {
        (this.component as any)._domNode = domNode;
      }
    });
  }

  private handleNoUpdatePath(newVNode: VNode): void {
    logger.updates(`${this.component.constructor.name}: no update path (no container/vnode/dom)`);

    let domNode: Node | null = null;
    if ((this.component as any)._domNode) {
      domNode = (this.component as any)._domNode;
    } else if (
      (this.component as any)._vnode &&
      ((this.component as any)._vnode as any).dom
    ) {
      domNode = ((this.component as any)._vnode as any).dom;
    }

    if (domNode && domNode instanceof HTMLElement) {
      let container: HTMLElement | null = null;
      // Try to find container from DOM node's parent
      if (domNode.parentElement) {
        const parent = domNode.parentElement;
        if (
          parent.children.length === 1 ||
          parent.id === "app" ||
          parent.classList.contains("app-root")
        ) {
          container = parent;
          (this.component as any)._container = container;
        }
      }

      // Store instance on new VNode
      if (
        typeof newVNode === "object" &&
        newVNode !== null &&
        "type" in newVNode &&
        typeof newVNode.type === "function"
      ) {
        (newVNode as any).__componentInstance = this.component;
      }

      untrack(() => {
        if (container && container instanceof HTMLElement) {
          renderToDOM(newVNode, container);
        } else if (domNode) {
          updateDOMNode(domNode, newVNode);
          (newVNode as any).dom = domNode;
        }
      });

      (this.component as any)._vnode = newVNode;
      if (typeof newVNode === "object" && newVNode !== null) {
        (newVNode as { dom?: Node }).dom = domNode;
      }
      (this.component as any)._domNode = domNode;
      return;
    }

    // Check if _vnode exists with dom (from previous renderComponent call)
    if (
      (this.component as any)._vnode &&
      ((this.component as any)._vnode as any).dom
    ) {
      const domNode = ((this.component as any)._vnode as any).dom;
      if (domNode instanceof HTMLElement) {
        if (
          typeof newVNode === "object" &&
          newVNode !== null &&
          "type" in newVNode &&
          typeof newVNode.type === "function"
        ) {
          (newVNode as any).__componentInstance = this.component;
        }
        untrack(() => {
          updateDOMNode(domNode, newVNode);
          (this.component as any)._vnode = newVNode;
          (newVNode as any).dom = domNode;
          (this.component as any)._domNode = domNode;
        });
        return;
      }
    }

    // No DOM node found - try root container fallback (e.g. #app) so initial render can proceed
    if (typeof document !== "undefined") {
      const rootContainer =
        document.querySelector("#app") ||
        document.querySelector("[data-app-root]") ||
        document.body;
      if (
        rootContainer &&
        rootContainer instanceof HTMLElement &&
        (rootContainer.id === "app" ||
          rootContainer.hasAttribute("data-app-root") ||
          rootContainer === document.body)
      ) {
        (this.component as any)._container = rootContainer;
        if (
          typeof newVNode === "object" &&
          newVNode !== null &&
          "type" in newVNode &&
          typeof newVNode.type === "function"
        ) {
          (newVNode as any).__componentInstance = this.component;
        }
        logger.updates(`${this.component.constructor.name}: recovered root container, initial render`);
        untrack(() => {
          if (rootContainer && rootContainer instanceof HTMLElement) renderToDOM(newVNode, rootContainer);
        });
        const firstChild = rootContainer.firstChild;
        if (
          firstChild &&
          typeof newVNode === "object" &&
          newVNode !== null
        ) {
          (newVNode as { dom?: Node }).dom = firstChild;
          (this.component as any)._vnode = newVNode;
          (this.component as any)._domNode = firstChild;
        }
        return;
      }
    }

    logger.updates(`${this.component.constructor.name}: no update path, waiting for renderer`);
  }

  private reportUpdateMetrics(t0: number, t1: number): void {
    // CRITICAL: Don't use require() in browser context - this causes ReferenceError
    // TODO: Implement proper conditional import or remove devtools bridge for browser builds
    if (typeof window !== "undefined") {
      // Skip devtools reporting in browser environment
      return;
    }

    // This code path should only execute in Node.js environment
    try {
      const {
        getDevtoolsBridge,
        isDevtoolsEnabled,
        isTelemetryEnabled,
      } = require("../devtools/bridge.js");

      if (isDevtoolsEnabled()) {
        try {
          let stateSummary: Record<string, unknown> | undefined;
          try {
            stateSummary = {
              ...(this.component.state as unknown as Record<string, unknown>),
            };
          } catch {
            stateSummary = undefined;
          }
          getDevtoolsBridge().onComponentUpdate({
            id: (this.component as any)._devtoolsId,
            stateSummary,
          });

          try {
            const ms = Math.max(0, t1 - t0);
            getDevtoolsBridge().recordEvent({
              t: Date.now(),
              type: "render",
              msg: `${(this.component as any)._devtoolsId}:${ms}`,
            });
          } catch {
            /* ignore */
          }

          if (isTelemetryEnabled() && getDevtoolsBridge().recordEventTyped) {
            try {
              const ms = Math.max(0, t1 - t0);
              getDevtoolsBridge().recordEventTyped!({
                t: Date.now(),
                category: "perf",
                name: "render",
                componentId: (this.component as any)._devtoolsId,
                data: { durationMs: ms },
              });
            } catch {
              /* ignore */
            }
          }
        } catch (error) {
          logger.warn(
            "Error reporting to devtools:",
            error instanceof Error ? error.message : error,
          );
        }
      }
    } catch (error) {
      // ignore require() errors in browser context
      logger.warn("Could not load devtools bridge");
    }
  }
}
