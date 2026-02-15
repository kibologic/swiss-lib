/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import { type VNode, createElement, Fragment } from "../vdom/vdom.js";
import { reactive } from "../reactivity/reactive.js";
import { effect, untrack } from "../reactivity/effect.js";
import { type EffectDisposer } from "../reactivity/types/index.js";
import {
  type SwissComponentOptions,
  type SwissErrorInfo,
  type ComponentHook,
} from "./types/index.js";
import { LifecycleManager } from "./lifecycle.js";
import { SwissContext, cleanupContextSubscriptions } from "./context.js";
import { createPortal, useSlot } from "./portals.js";
import { serverInit, hydrate as hydrateSSR } from "./ssr.js";
import { renderToString } from "../vdom/vdom.js";
import {
  OnMount,
  OnUpdate,
  OnUnmount,
  getLifecycleMetadata,
} from "./decorators/index.js";
import { BaseComponent } from "./base-component.js";
import {
  type BaseComponentProps,
  type BaseComponentState,
} from "./types/index.js";
import type { Plugin, PluginContext } from "../plugins/pluginInterface.js";
import {
  FenestrationRegistry,
  type FenestrationContext,
} from "../fenestration/registry.js";
import {
  getDevtoolsBridge,
  isDevtoolsEnabled,
  isTelemetryEnabled,
} from "../devtools/bridge.js";
import { getRemediationMessage } from "../error/remediation.js";
import { CapabilityManager } from "../security/capability-manager.js";

export class SwissComponent<
  P extends BaseComponentProps = BaseComponentProps,
  S extends BaseComponentState = BaseComponentState,
> extends BaseComponent<P, S> {
  public static requires: string[] = [];
  public static contextType?: symbol;
  public static isErrorBoundary: boolean = false;

  public error: SwissErrorInfo | null = null;
  public plugins: Plugin[] | null = null;
  public element: HTMLElement;
  protected _devtoolsId: string;

  // --- Context Properties ---
  protected _userContext: { id: string; roles: string[] } | undefined =
    undefined;
  protected _sessionContext: { id: string; permissions: string[] } | undefined =
    undefined;
  protected _tenantContext: string | undefined = undefined;

  // Context provided to plugins
  protected _pluginContext: PluginContext | null = null;

  protected _lifecycle: LifecycleManager = new LifecycleManager();
  protected _hooks: ComponentHook[] = [];
  protected _isMounted: boolean = false;
  protected _isServer: boolean = typeof window === "undefined";
  protected _container: HTMLElement | null = null;
  protected _vnode: VNode | null = null;
  protected _effectDisposers: EffectDisposer[] = [];
  protected _portals: Map<HTMLElement, VNode> = new Map();
  protected _errorHandlingPhase: boolean = false;
  protected _childErrors: Map<SwissComponent, SwissErrorInfo> = new Map();
  protected _slotContent: Map<string, VNode[]> = new Map();
  protected _effects: Set<EffectDisposer> = new Set();
  protected _capabilityCache: Map<string, unknown> = new Map();
  protected updateScheduled: boolean = false;
  protected _initialized: boolean = false;
  protected _reactivitySetup: boolean = false;

  constructor(props: P, options: SwissComponentOptions = {}) {
    super(props);
    // Ensure props are properly set (fix for props inheritance bug)
    if (!this.props) this.props = props;
    this.element = document.createElement("div");
    // Create a stable devtools ID for this instance (dev-only usage)
    this._devtoolsId = `cmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;

    // Apply options
    if (options.plugins) this.plugins = options.plugins;

    // Mark as error boundary if specified
    if (options.errorBoundary) {
      (this.constructor as typeof SwissComponent).isErrorBoundary = true;
    }

    // Initialize component logic moved to initialize() method
    // to ensure class fields are initialized before reactivity setup

    // Apply decorator metadata (lifecycle, render, etc.)
    const lifecycleMetadata = getLifecycleMetadata(this);
    if (lifecycleMetadata && typeof lifecycleMetadata === "object") {
      // Apply lifecycle decorators
      // lifecycleMetadata is an object like { mount: [...], unmount: [...], update: [...] }
      if (lifecycleMetadata.mount && Array.isArray(lifecycleMetadata.mount)) {
        lifecycleMetadata.mount.forEach((hook: any) => {
          if (hook.method && (this as any)[hook.method]) {
            this._lifecycle.on("mounted", () => (this as any)[hook.method]());
          }
        });
      }
      if (lifecycleMetadata.update && Array.isArray(lifecycleMetadata.update)) {
        lifecycleMetadata.update.forEach((hook: any) => {
          if (hook.method && (this as any)[hook.method]) {
            this._lifecycle.on("updated", () => (this as any)[hook.method]());
          }
        });
      }
      if (
        lifecycleMetadata.unmount &&
        Array.isArray(lifecycleMetadata.unmount)
      ) {
        lifecycleMetadata.unmount.forEach((hook: any) => {
          if (hook.method && (this as any)[hook.method]) {
            this._lifecycle.on("unmounted", () => (this as any)[hook.method]());
          }
        });
      }
    }
    this._pluginContext = this.createPluginContext();

    // Emit mount event will occur in mount(); ID prepared here.
  }

  public handleMount(): void {
    // Custom mount logic
  }

  public handleUpdate(): void {
    // Custom update logic
  }

  public handleDestroy(): void {
    // Custom destroy logic
  }

  // --- Error Boundary System ---

  /**
   * Captures errors from child components
   */
  captureChildError(child: SwissComponent, errorInfo: SwissErrorInfo): boolean {
    if (
      (this.constructor as typeof SwissComponent).isErrorBoundary &&
      !this.error
    ) {
      this._childErrors.set(child, errorInfo);
      this.error = {
        error: new Error(`Error in child component ${child.constructor.name}`),
        phase: "render",
        component: this,
        timestamp: Date.now(),
      };
      this.scheduleUpdate();
      return true; // Error handled
    }

    if (this._parent) {
      return this._parent.captureChildError(this, errorInfo);
    }

    return false; // Error not handled
  }

  /**
   * Resets error state for this component and its children
   */
  resetErrorBoundary(): void {
    if (this.error) {
      this.error = null;
      this._childErrors.clear();
      this.scheduleUpdate();
    }

    // Propagate reset to children
    this._children.forEach((child) => {
      if ((child.constructor as typeof SwissComponent).isErrorBoundary) {
        child.resetErrorBoundary();
      }
    });
  }

  /**
   * Handles errors during lifecycle phases
   */
  public captureError(error: unknown, phase: string): void {
    if (this._errorHandlingPhase) return;
    this._errorHandlingPhase = true;

    const errorInfo: SwissErrorInfo = {
      error,
      phase,
      component: this,
      timestamp: Date.now(),
    };

    // Log the error
    console.error(
      `Error in component ${this.constructor.name} during ${phase}:`,
      error,
    );

    // Devtools: record error with remediation guidance (dev-only)
    if (isDevtoolsEnabled()) {
      try {
        const required =
          (this.constructor as typeof SwissComponent).requires ?? [];
        const advice = getRemediationMessage(error, phase, this, required);
        // Include component id so inspector can filter per component (legacy)
        getDevtoolsBridge().recordEvent({
          t: Date.now(),
          type: "error",
          msg: `${this._devtoolsId}:${advice.message}`,
        });
        // Typed telemetry (opt-in)
        if (isTelemetryEnabled() && getDevtoolsBridge().recordEventTyped) {
          try {
            getDevtoolsBridge().recordEventTyped!({
              t: Date.now(),
              category: "error",
              name: "boundary-error",
              componentId: this._devtoolsId,
              data: { message: advice.message, phase },
            });
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Find nearest error boundary
    let boundary = this._parent;
    while (boundary && !boundary.captureChildError(this, errorInfo)) {
      boundary = boundary._parent;
    }

    // If no boundary is found, dispatch a global error
    if (!boundary) {
      this.dispatchGlobalError(error, phase);
    }

    this._errorHandlingPhase = false;
  }

  /**
   * Global error reporting
   */
  public dispatchGlobalError(error: unknown, phase: string): void {
    const event = new CustomEvent("swiss-error", {
      detail: {
        error,
        phase,
        component: this,
        timestamp: Date.now(),
      },
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }

  // --- Lifecycle System ---
  _setupDeclarativeListeners(): void {
    // Implementation placeholder
  }

  public on(
    phase: string,
    callback: (...args: unknown[]) => void,
    options: {
      once?: boolean;
      priority?: number;
      capability?: string;
    } = {},
  ): this {
    this._lifecycle.on(phase, callback, options);
    return this;
  }

  public initialize(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Only make state reactive if it's not already reactive
    // Check if state is already reactive by checking for __listeners property
    if (!(this.state as any).__listeners) {
      this.state = reactive(this.state as S) as S;
    }
    this.setupReactivity();
    this.loadPlugins();
    this.validateCapabilities();
  }

  public validateCapabilities(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Fenestrate - Core capability resolution method for SwissComponent
   * Provides secure, scoped access to capabilities across architectural layers
   *
   * @param capabilityId - Capability ID to resolve (e.g., 'ui:render', 'data:fetch')
   * @param params - Parameters to pass to the capability
   * @returns Resolved capability result or null if not available
   */
  public fenestrate<T>(capabilityId: string, ...params: unknown[]): T | null {
    try {
      if (this._capabilityCache.has(capabilityId)) {
        return this._capabilityCache.get(capabilityId) as T;
      }

      const context: FenestrationContext = {
        component: this,
        user: this._userContext,
        session: this._sessionContext,
        tenant: this._tenantContext,
        layer: "component",
        requiredCapabilities: (this.constructor as typeof SwissComponent)
          .requires,
      };

      const result = FenestrationRegistry.pierce<T>(
        capabilityId,
        context,
        ...params,
      );
      if (result.success) {
        this._capabilityCache.set(capabilityId, result.data);
        return result.data ?? null;
      }
      this.captureError(new Error(result.error), `fenestrate:${capabilityId}`);
      return null;
    } catch (error) {
      this.captureError(error as Error, `fenestrate:${capabilityId}`);
      return null;
    }
  }

  /**
   * Async version of fenestrate for capabilities that require async resolution
   *
   * @param capabilityId - Capability ID to resolve
   * @param params - Parameters to pass to the capability
   * @returns Promise resolving to capability result or null
   */
  public async fenestrateAsync<T>(
    capabilityId: string,
    ...params: unknown[]
  ): Promise<T | null> {
    try {
      if (this._capabilityCache.has(capabilityId)) {
        return this._capabilityCache.get(capabilityId) as T;
      }

      const context: FenestrationContext = {
        component: this,
        user: this._userContext,
        session: this._sessionContext,
        tenant: this._tenantContext,
        layer: "component",
        requiredCapabilities: (this.constructor as typeof SwissComponent)
          .requires,
      };

      const result = await FenestrationRegistry.pierceAsync<T>(
        capabilityId,
        context,
        ...params,
      );
      if (result.success) {
        this._capabilityCache.set(capabilityId, result.data);
        return result.data ?? null;
      }
      this.captureError(
        new Error(result.error),
        `fenestrateAsync:${capabilityId}`,
      );
      return null;
    } catch (error) {
      this.captureError(error as Error, `fenestrateAsync:${capabilityId}`);
      return null;
    }
  }

  public async loadPlugins(): Promise<void> {
    if (!this.plugins) return;
    for (const plugin of this.plugins) {
      if (plugin.init) {
        await plugin.init(this._pluginContext as PluginContext);
      }
    }
  }

  public setupReactivity(): void {
    // Prevent multiple calls to setupReactivity
    if (this._reactivitySetup) {
      console.log(
        `[Component] setupReactivity() already called for ${this.constructor.name}, skipping`,
      );
      return;
    }
    this._reactivitySetup = true;

    // Setup effect for rendering
    // The effect must access state properties during render to track them
    console.log(
      "[Component] setupReactivity() called for",
      this.constructor.name,
    );
    const renderEffect = effect(() => {
      // CRITICAL: The render() method accesses state properties (e.g., this.state.sidebarCollapsed)
      // This access happens during render, which triggers the Proxy get trap
      // The get trap tracks this effect as a listener for those specific properties
      
      // Call performUpdate which will call safeRender internally
      // performUpdate handles all the DOM update logic
      this.performUpdate();
    });
    this.trackEffect(renderEffect);
  }

  public trackEffect(disposer: EffectDisposer): void {
    this._effects.add(disposer);
  }

  public clearEffects(): void {
    this._effects.forEach((disposer) => disposer());
    this._effects.clear();
  }

  public async executeHookPhase(
    phase: string,
    error?: Error | unknown,
  ): Promise<void> {
    await this._lifecycle.executeHookPhase(phase, this, error);
  }

  public performUpdate(): void {
    console.log(
      `[Component] performUpdate() called for ${this.constructor.name}`,
    );
    try {
      const t0 =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();

      // Always render to track dependencies
      console.log(
        `[Component] Calling safeRender() for ${this.constructor.name}`,
      );
      const newVNode = this.safeRender();
      console.log(
        `[Component] safeRender() returned VNode for ${this.constructor.name}`,
      );

      // Try to find container from multiple sources
      let container = this._container;

      // If no container, try to find it from the old VNode's DOM node
      if (!container && this._vnode && (this._vnode as any).dom) {
        const domNode = (this._vnode as any).dom;
        if (domNode instanceof HTMLElement && domNode.parentElement) {
          // For root components, the container is the parent of the DOM node
          // But we need to check if this is actually the root
          // If the DOM node is directly in the container (not nested), use parentElement
          container = domNode.parentElement as HTMLElement;
          console.log(
            `[Component] Found container from DOM node parent for ${this.constructor.name}`,
          );
        }
      }

      // CRITICAL: Check _domNode as well - it might be set by renderer even if _vnode is not set yet
      const hasDomNode = !!(this as any)._domNode;
      const vnodeHasDom = !!(this._vnode && (this._vnode as any).dom);

      console.log(
        `[Component] performUpdate() checking update path for ${this.constructor.name}:`,
        {
          hasContainer: !!container,
          hasVNode: !!this._vnode,
          vnodeHasDom: vnodeHasDom,
          hasDomNode: hasDomNode,
        },
      );

      if (container) {
        // Root component with container
        const oldVNode = this._vnode;
        console.log(
          `[Component] Root component update for ${this.constructor.name} - has container, oldVNode:`,
          !!oldVNode,
          `has dom:`,
          !!(oldVNode && (oldVNode as any).dom),
        );

        // Ensure container is set on instance for future updates
        if (this._container !== container) {
          this._container = container;
          console.log(
            `[Component] Set container on ${this.constructor.name} instance`,
          );
        }

        // CRITICAL: Store this component instance on the new VNode BEFORE any rendering
        // This ensures renderToDOM and createDOMNode can find and reuse the existing instance
        if (
          typeof newVNode === "object" &&
          newVNode !== null &&
          "type" in newVNode &&
          typeof newVNode.type === "function"
        ) {
          (newVNode as any).__componentInstance = this;
          console.log(
            `[Component] Stored instance on newVNode for ${this.constructor.name}`,
          );
        }

        // CRITICAL: Also preserve the DOM reference from oldVNode if it exists
        // This ensures renderToDOM can find the existing DOM node
        if (oldVNode && (oldVNode as any).dom) {
          (newVNode as any).dom = (oldVNode as any).dom;
          console.log(
            `[Component] Preserved dom reference from oldVNode for ${this.constructor.name}`,
          );
        } else if ((this as any)._domNode) {
          // Fallback to _domNode if oldVNode.dom is not set
          (newVNode as any).dom = (this as any)._domNode;
          console.log(
            `[Component] Using _domNode as dom reference for ${this.constructor.name}`,
          );
        }

        if (oldVNode && (oldVNode as any).dom) {
          // Update existing DOM
          // CRITICAL: Untrack DOM operations to prevent subscribing to reactive dependencies
          // during the update. This prevents infinite render loops.
          console.log(
            `[Component] Calling updateDOMNode() for ${this.constructor.name}`,
          );
          untrack(() => {
            updateDOMNode((oldVNode as any).dom, newVNode);
            // Preserve the dom reference
            (newVNode as any).dom = (oldVNode as any).dom;
            // CRITICAL: Also update _domNode
            (this as any)._domNode = (oldVNode as any).dom;
          });
          console.log(
            `[Component] updateDOMNode() completed for ${this.constructor.name}`,
          );
        } else {
          // Initial render or container has child but oldVNode.dom is not set
          // Use renderToDOM which will handle finding existing instances
          // CRITICAL: The newVNode already has __componentInstance set, so renderToDOM will reuse it
          console.log(
            `[Component] Calling renderToDOM() for ${this.constructor.name} (container has ${container.firstChild ? "child" : "no child"})`,
          );
          untrack(() => {
            renderToDOM(newVNode, container!);
            // CRITICAL: After renderToDOM, ensure _domNode is set
            if (container && container.firstChild && !(this as any)._domNode) {
              (this as any)._domNode = container.firstChild;
              console.log(
                `[Component] Set _domNode from container.firstChild for ${this.constructor.name}`,
              );
            }
          });
        }

        this._vnode = newVNode;
        // Preserve dom reference on new VNode (already set above, but ensure it's preserved)
        if (oldVNode && (oldVNode as any).dom) {
          (newVNode as any).dom = (oldVNode as any).dom;
        } else if ((this as any)._domNode) {
          (newVNode as any).dom = (this as any)._domNode;
        }
      } else if ((this as any)._domNode) {
        // CRITICAL: Check _domNode first - it's set by renderer even if _vnode is not set yet
        // This handles the case where performUpdate() is called before renderComponent sets _vnode
        const domNode = (this as any)._domNode;
        console.log(
          `[Component] Using _domNode for ${this.constructor.name} update (${domNode instanceof HTMLElement ? domNode.tagName : "unknown"})`,
        );

        // Store instance on new VNode for renderer
        if (
          typeof newVNode === "object" &&
          newVNode !== null &&
          "type" in newVNode &&
          typeof newVNode.type === "function"
        ) {
          (newVNode as any).__componentInstance = this;
        }

        // Update the DOM node
        // CRITICAL: Untrack to prevent subscribing to reactive dependencies during DOM update
        untrack(() => {
          updateDOMNode(domNode, newVNode);
          // Update _vnode with new VNode and preserve dom property
          this._vnode = newVNode;
          (newVNode as any).dom = domNode;
          // Ensure _domNode is set
          (this as any)._domNode = domNode;
        });
        console.log(
          `[Component] Updated DOM using _domNode for ${this.constructor.name}`,
        );
        return;
      } else if (this._vnode && (this._vnode as any).dom) {
        // Child component update OR root component that lost container reference
        const domNode = (this._vnode as any).dom;

        // CRITICAL: Store instance on VNode BEFORE any DOM operations
        // This ensures updateComponentNode can find it
        if (
          typeof newVNode === "object" &&
          newVNode !== null &&
          "type" in newVNode &&
          typeof newVNode.type === "function"
        ) {
          (newVNode as any).__componentInstance = this;
          console.log(
            `[Component] Stored instance on newVNode for ${this.constructor.name} before updateDOMNode`,
          );
        }

        // CRITICAL: If this is a root component (no container but has vnode.dom),
        // try to find the container from the DOM node's parent
        // This happens when _container is lost but the DOM node still exists
        if (
          !container &&
          domNode instanceof HTMLElement &&
          domNode.parentElement
        ) {
          // This might be a root component that lost its container reference
          // Check if the parent is the actual container (not just any parent)
          const parent = domNode.parentElement;
          // If the parent has only one child (this component), it's likely the container
          // Or if the parent is the #app element, it's definitely the container
          if (
            parent.children.length === 1 ||
            parent.id === "app" ||
            parent.classList.contains("app-root")
          ) {
            container = parent;
            this._container = container;
            console.log(
              `[Component] Recovered container for root component ${this.constructor.name} from DOM node parent`,
            );
            // Now use the root component update path
            const oldVNode = this._vnode;
            untrack(() => {
              if (oldVNode && (oldVNode as any).dom) {
                console.log(
                  `[Component] Calling updateDOMNode() for recovered root component ${this.constructor.name}`,
                );
                updateDOMNode((oldVNode as any).dom, newVNode);
                (newVNode as any).dom = (oldVNode as any).dom;
              } else {
                console.log(
                  `[Component] Calling renderToDOM() for recovered root component ${this.constructor.name}`,
                );
                renderToDOM(newVNode, container!);
              }
            });
            this._vnode = newVNode;
            if (oldVNode && (oldVNode as any).dom) {
              (newVNode as any).dom = (oldVNode as any).dom;
            }
            // CRITICAL: Ensure _domNode is set
            if ((this as any)._domNode !== domNode) {
              (this as any)._domNode = domNode;
            }
            return;
          }
        }

        // Regular child component update
        console.log(
          `[Component] Child component update for ${this.constructor.name}, calling updateDOMNode()`,
        );
        untrack(() => {
          updateDOMNode(domNode, newVNode);
          this._vnode = newVNode;
          // Preserve dom reference on new VNode
          (newVNode as any).dom = domNode;
          // CRITICAL: Ensure _domNode is set
          if ((this as any)._domNode !== domNode) {
            (this as any)._domNode = domNode;
          }
        });
        console.log(
          `[Component] Child component update completed for ${this.constructor.name}`,
        );
      } else {
        console.log(
          `[Component] ⚠️ No update path for ${this.constructor.name} - no container (${!container}), no vnode (${!this._vnode}), no vnode.dom (${!(this._vnode && (this._vnode as any).dom)})`,
        );
        console.log(
          `[Component] Checking _domNode for ${this.constructor.name}:`,
          {
            hasDomNode: !!(this as any)._domNode,
            domNodeType: (this as any)._domNode
              ? (this as any)._domNode.constructor.name
              : "none",
            hasVNode: !!this._vnode,
            vnodeHasDom: !!(this._vnode && (this._vnode as any).dom),
          },
        );

        // CRITICAL: Try to find DOM node from instance's _domNode property (set by renderer)
        let domNode: Node | null = null;
        // Check _domNode first (most reliable for child components)
        if ((this as any)._domNode) {
          domNode = (this as any)._domNode;
          console.log(
            `[Component] Found DOM node from instance._domNode for ${this.constructor.name}`,
          );
        } else if (this._vnode && (this._vnode as any).dom) {
          domNode = (this._vnode as any).dom;
          console.log(
            `[Component] Found DOM node from _vnode.dom for ${this.constructor.name}`,
          );
        } else {
          // Last resort: try to find DOM node from componentInstances map
          // This won't work directly (WeakMap doesn't support iteration), but we can try
          // to find it by searching the DOM tree for elements that have this instance
          console.log(
            `[Component] No DOM node found in _domNode or _vnode.dom for ${this.constructor.name}, will try DOM search`,
          );
        }

        if (domNode) {
          // We have a DOM node - use it for update
          if (domNode instanceof HTMLElement) {
            // Try to find container from DOM node's parent
            if (domNode.parentElement) {
              const parent = domNode.parentElement;
              // Check if parent is likely the container (has only one child or is #app)
              if (
                parent.children.length === 1 ||
                parent.id === "app" ||
                parent.classList.contains("app-root")
              ) {
                container = parent;
                this._container = container;
                console.log(
                  `[Component] Recovered container from DOM node parent for ${this.constructor.name}`,
                );
              }
            }

            // Store instance on new VNode for renderToDOM to find
            if (
              typeof newVNode === "object" &&
              newVNode !== null &&
              "type" in newVNode &&
              typeof newVNode.type === "function"
            ) {
              (newVNode as any).__componentInstance = this;
            }

            // Update the DOM node
            untrack(() => {
              if (container) {
                // Root component - use renderToDOM
                console.log(
                  `[Component] Using renderToDOM with recovered container for ${this.constructor.name}`,
                );
                renderToDOM(newVNode, container);
              } else {
                // Child component - use updateDOMNode
                console.log(
                  `[Component] Using updateDOMNode for ${this.constructor.name}`,
                );
                updateDOMNode(domNode, newVNode);
                (newVNode as any).dom = domNode;
              }
            });

            this._vnode = newVNode;
            // Ensure dom property is set
            if (typeof newVNode === "object" && newVNode !== null) {
              (newVNode as { dom?: Node }).dom = domNode;
            }
            // Update instance's _domNode
            (this as any)._domNode = domNode;
            return;
          }
        }

        // Last resort: No update path found
        // This happens when:
        // 1. Child component is being rendered for the first time (DOM doesn't exist yet)
        // 2. Component instance was created but DOM hasn't been created yet
        //
        // CRITICAL: During initial render, performUpdate() is called from the reactive effect
        // BEFORE renderComponent() sets _vnode. If we store newVNode here, renderComponent()
        // will overwrite it with a different VNode, causing a mismatch.
        //
        // Solution: Don't store the VNode here. Let renderComponent() set _vnode when it
        // calls instance.render(). Then createDOMNode() will set the dom property on that VNode.
        // Future updates will have _vnode.dom set, so they can update properly.
        console.log(
          `[Component] ⚠️ No update path for ${this.constructor.name} - initial render, waiting for renderer to create DOM`,
        );

        // CRITICAL: Do NOT store newVNode as _vnode here because:
        // 1. renderComponent() will call instance.render() and set _vnode to a different VNode
        // 2. createDOMNode() will set the dom property on that VNode
        // 3. If we store newVNode here, it will be overwritten and won't have the dom property

        // However, we should check if _vnode is already set (from a previous renderComponent call)
        // If it is, and it has a dom property, we can use it for updates
        if (this._vnode && (this._vnode as any).dom) {
          // _vnode exists and has dom - this means renderComponent already ran
          // Update the existing DOM
          console.log(
            `[Component] Found _vnode with dom for ${this.constructor.name}, updating DOM`,
          );
          const domNode = (this._vnode as any).dom;
          if (domNode instanceof HTMLElement) {
            // Store instance on new VNode for renderer
            if (
              typeof newVNode === "object" &&
              newVNode !== null &&
              "type" in newVNode &&
              typeof newVNode.type === "function"
            ) {
              (newVNode as any).__componentInstance = this;
            }
            untrack(() => {
              updateDOMNode(domNode, newVNode);
              // Update _vnode with new VNode and preserve dom property
              this._vnode = newVNode;
              (newVNode as any).dom = domNode;
              (this as any)._domNode = domNode;
            });
            return;
          }
        }

        // No _vnode or no dom property - check if _domNode is set (by renderer)
        // If _domNode is set, the DOM exists but _vnode might not be set yet
        // In this case, we should wait for the next update cycle when _vnode will be set
        if ((this as any)._domNode) {
          console.log(
            `[Component] _domNode exists for ${this.constructor.name} but _vnode not set yet - waiting for renderer to set _vnode`,
          );
          // Don't do anything - the renderer will set _vnode on the next render
          // Future updates will have _vnode.dom set and can update properly
          return;
        }

        // No _vnode, no dom property, and no _domNode - this is initial render
        // Don't store anything, let renderComponent() handle it
        // The renderer will:
        // 1. Call renderComponent() which calls instance.render() and sets _vnode
        // 2. Call createDOMNode() which sets dom property on _vnode and _domNode
        // 3. Future updates will have _vnode.dom set and can update properly
        return;
      }

      const t1 =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();

      this.executeHookPhase("updated");
      // Devtools: component updated
      if (isDevtoolsEnabled()) {
        try {
          // TECH-DEBT: Shallow serialization of component state. Replace with a
          // structured serializer that redacts sensitive fields, limits depth,
          // and handles non-serializable values (functions, symbols) deterministically.
          let stateSummary: Record<string, unknown> | undefined;
          try {
            stateSummary = {
              ...(this.state as unknown as Record<string, unknown>),
            };
          } catch {
            stateSummary = undefined;
          }
          getDevtoolsBridge().onComponentUpdate({
            id: this._devtoolsId,
            stateSummary,
          });
          // Record render duration for inspector overlay (legacy)
          try {
            const ms = Math.max(0, (t1 as number) - (t0 as number));
            getDevtoolsBridge().recordEvent({
              t: Date.now(),
              type: "render",
              msg: `${this._devtoolsId}:${ms}`,
            });
          } catch {
            /* ignore */
          }
          // Typed telemetry (opt-in)
          if (isTelemetryEnabled() && getDevtoolsBridge().recordEventTyped) {
            try {
              const ms = Math.max(0, (t1 as number) - (t0 as number));
              getDevtoolsBridge().recordEventTyped!({
                t: Date.now(),
                category: "perf",
                name: "render",
                componentId: this._devtoolsId,
                data: { durationMs: ms },
              });
            } catch {
              /* ignore */
            }
          }
        } catch {
          // ignore devtools errors
        }
      }
    } catch (error) {
      this.captureError(error, "render");
    }
  }

  /**
   * Wraps render method in error boundary
   */
  public render(): VNode {
    // Base render method, should be overridden by subclasses
    return createElement("div", {}, "Please implement the render method");
  }

  /**
   * Wraps render method in error boundary
   */
  public safeRender(): VNode {
    if (this.error) {
      return this.renderErrorFallback();
    }

    try {
      // Execute before-render hook
      this.executeHookPhase("beforeRender");

      const vnode = this.render();

      // Execute after-render hook
      this.executeHookPhase("afterRender");

      return vnode;
    } catch (error) {
      this.captureError(error, "render");
      return this.renderErrorFallback();
    }
  }

  /**
   * Default error fallback UI
   */
  public renderErrorFallback(): VNode {
    return createElement(
      "div",
      { style: "border: 1px solid red; padding: 10px; color: red;" },
      createElement("h3", {}, "Component Error"),
      createElement("p", {}, `Phase: ${this.error?.phase || "N/A"}`),
      createElement(
        "pre",
        { style: "white-space: pre-wrap;" },
        (this.error?.error instanceof Error
          ? this.error.error.stack
          : String(this.error?.error)) || "No error details available",
      ),
    );
  }

  /**
   * Renders children with error boundary support
   */
  public renderWithBoundary(children: VNode[]): VNode {
    return createElement(Fragment, {}, ...children);
  }

  /**
   * Mounts the component to a DOM element
   */
  public mount(container: HTMLElement): void {
    if (this._isMounted) return;

    // Set container first so it's available for rendering
    this._container = container;

    // CRITICAL: Do initial render BEFORE setting up reactivity
    // This ensures the instance is stored in componentInstances map and _vnode is set
    // so that reactive updates can find the existing instance
    console.log(
      `[Component] mount() called for ${this.constructor.name}, doing initial render`,
    );
    const initialVNode = this.safeRender();

    // CRITICAL: Store the instance on the VNode so renderToDOM can find it
    // This prevents renderComponent from creating a new instance
    if (
      typeof initialVNode === "object" &&
      initialVNode !== null &&
      "type" in initialVNode
    ) {
      (initialVNode as any).__componentInstance = this;
    }

    // Render to DOM - this will create the DOM and store the instance
    // renderToDOM will pass __componentInstance to renderComponent via createDOMNode
    // renderComponent will reuse our instance but NOT call initialize() (it sets _initialized = true)
    // So we need to call initialize() AFTER the render, but BEFORE setting up reactivity
    untrack(() => {
      renderToDOM(initialVNode, container);
    });

    // Store the VNode and ensure dom property is set
    this._vnode = initialVNode;
    if (
      container.firstChild &&
      typeof initialVNode === "object" &&
      initialVNode !== null
    ) {
      (initialVNode as { dom?: Node }).dom = container.firstChild;
      console.log(
        `[Component] mount() set _vnode.dom for ${this.constructor.name}`,
      );
    }

    // CRITICAL: Now call initialize() to set up component-specific initialization
    // renderComponent did NOT set _initialized = true (because instance wasn't initialized yet)
    // So initialize() will run normally and set up reactivity
    this.initialize();

    this.executeHookPhase("beforeMount");

    this._isMounted = true;

    // Bind DOM event handlers from decorators
    this.bindEventHandlers();

    this.executeHookPhase("mounted");
    // Devtools: component mounted
    if (isDevtoolsEnabled()) {
      try {
        const parentId =
          (this as unknown as { _parent?: SwissComponent | null })._parent?.[
            "_devtoolsId"
          ] ?? null;
        const consumes =
          (this.constructor as typeof SwissComponent).requires ?? [];
        const provides = CapabilityManager.getProvidedCapabilities(
          this.constructor as typeof SwissComponent,
        );
        getDevtoolsBridge().onComponentMount({
          id: this._devtoolsId,
          name: this.constructor.name,
          parentId,
          provides,
          consumes,
        });
        // TECH-DEBT: Ad-hoc event model. Replace with typed DevtoolsEvent categories
        // (component, capability, performance, error) and structured payloads.
        try {
          getDevtoolsBridge().recordEvent({
            t: Date.now(),
            type: "mount",
            msg: this._devtoolsId,
          });
        } catch {
          /* ignore */
        }
      } catch {
        // ignore devtools errors
      }
    }
  }

  /**
   * Binds DOM event handlers from decorator metadata
   */
  private bindEventHandlers(): void {
    const eventHandlers = (
      this as unknown as {
        _swissEventHandlers?: Array<{
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
        }>;
      }
    )._swissEventHandlers;

    if (!eventHandlers || !this._container) return;

    for (const handler of eventHandlers) {
      const method = (this as unknown as Record<string, unknown>)[
        handler.method
      ];
      if (typeof method !== "function") {
        console.warn(
          `[Swiss] Event handler method '${handler.method}' not found on component ${this.constructor.name}`,
        );
        continue;
      }

      // Check capability if required
      if (
        handler.options.capability &&
        !CapabilityManager.has(handler.options.capability, this)
      ) {
        console.warn(
          `[Swiss] Missing capability '${handler.options.capability}' for event handler '${handler.method}'`,
        );
        continue;
      }

      // Create bound event handler
      const boundHandler = (event: Event) => {
        // Apply event options
        if (handler.options.preventDefault) {
          event.preventDefault();
        }
        if (handler.options.stopPropagation) {
          event.stopPropagation();
        }

        // Call the component method
        try {
          (method as (...args: unknown[]) => unknown).call(this, event);
        } catch (error) {
          this.captureError(error, `event:${handler.eventType}`);
        }
      };

      // Bind to DOM
      if (handler.selector) {
        // Delegate to specific elements within the container
        const elements = this._container.querySelectorAll(handler.selector);
        elements.forEach((element) => {
          element.addEventListener(handler.eventType, boundHandler, {
            capture: handler.options.capture,
            once: handler.options.once,
            passive: handler.options.passive,
          });
        });
      } else {
        // Bind to the container itself
        this._container.addEventListener(handler.eventType, boundHandler, {
          capture: handler.options.capture,
          once: handler.options.once,
          passive: handler.options.passive,
        });
      }
    }
  }

  /**
   * Unmounts the component
   */
  public unmountComponent(): void {
    if (!this._isMounted) return;

    try {
      this.executeHookPhase("beforeUnmount");
      // Devtools: component unmounted
      if (isDevtoolsEnabled()) {
        try {
          getDevtoolsBridge().onComponentUnmount(this._devtoolsId);
        } catch {
          /* ignore */
        }
      }
      // Unsubscribe from any context subscriptions registered for this component
      cleanupContextSubscriptions(this);

      // Clean up effects, watchers, etc.
      this.clearEffects();
      this._capabilityCache.clear();
      this._children = [];
      this._parent = null;

      // DOM removal
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      // Clean portals
      this._portals.forEach((_, container) => {
        container.innerHTML = "";
      });

      // Reset state
      this._hooks = [];
      this.state = reactive({} as S) as S;
      this._isMounted = false;
    } catch (error) {
      this.captureError(error, "destroy");
    }
  }

  public internalHydrate(): Promise<void> {
    return Promise.resolve();
  }

  public internalUnmount(): Promise<void> {
    return Promise.resolve();
  }

  async renderToString() {
    // Before render hook
    // await framework.hooks.callHook("beforeComponentRender", {
    //   component: this,
    // });
    const html = await this.renderInternal();
    // After render hook
    // await framework.hooks.callHook("afterComponentRender", {
    //   component: this,
    //   html,
    // });
    return html;
  }

  async hydrate(element: HTMLElement) {
    // Before mount hook
    // await framework.hooks.callHook("beforeComponentMount", {
    //   component: this,
    //   element,
    // });
    await this.internalHydrate();
    // After mount hook
    // await framework.hooks.callHook("afterComponentMount", {
    //   component: this,
    //   element,
    // });
  }

  async unmount() {
    // Before unmount hook
    // await framework.hooks.callHook("beforeComponentUnmount", {
    //   component: this,
    // });
    await this.internalUnmount();
  }

  public scheduleUpdate(): void {
    if (!this.updateScheduled) {
      console.log(
        `[Component] scheduleUpdate() called for ${this.constructor.name}, scheduling performUpdate()`,
      );
      this.updateScheduled = true;
      requestAnimationFrame(() => {
        console.log(
          `[Component] requestAnimationFrame callback executing for ${this.constructor.name}`,
        );
        this.performUpdate();
        this.updateScheduled = false;
      });
    } else {
      console.log(
        `[Component] scheduleUpdate() called for ${this.constructor.name} but update already scheduled`,
      );
    }
  }

  public getChildComponents(): SwissComponent[] {
    return this._children;
  }

  public provideContext<T>(key: symbol, value: T): void {
    this.context.set(key, value);
  }

  /**
   * Retrieve a context value by symbol, searching up the component tree.
   * Returns the nearest provided value or undefined if not found.
   */
  public useContext<T>(key: symbol): T | undefined {
    // Check self first
    if (this.context.has(key)) {
      return this.context.get(key) as T;
    }

    // Walk up parents to find the nearest provider
    let current: SwissComponent | null = this._parent;
    while (current) {
      if (current.context.has(key)) {
        return current.context.get(key) as T;
      }
      current = current._parent;
    }
    return undefined;
  }

  public renderInternal(): Promise<string> {
    return Promise.resolve("");
  }

  protected createPluginContext(): PluginContext {
    const hooksAdapter = {
      addHook: (
        hookName: string,
        handler: (...args: unknown[]) => void,
        _pluginId: string, // pluginId is not used in component-local hooks
        priority?: "low" | "normal" | "high" | "critical" | undefined,
      ) => {
        const priorityMap: Record<string, number> = {
          low: -1,
          normal: 0,
          high: 1,
        };
        this._lifecycle.on(hookName, handler as (...args: unknown[]) => void, {
          priority: priorityMap[priority || "normal"] ?? 0,
        });
      },
      removeHooks: () => {
        // Not supported for component-local hooks
      },
      callHook: async (hookName: string, context?: unknown) => {
        await this.executeHookPhase(hookName, context as Error);
      },
      hasHook: (hookName: string): boolean => {
        const hooks = this._lifecycle.getHooks();
        return !!hooks[hookName]?.length;
      },
      setGlobalContext: () => {
        // Not supported for component-local hooks
      },

      getHookSnapshot: () => {
        return Object.values(this._lifecycle.getHooks()).flat();
      },
    };

    return {
      hooks:
        hooksAdapter as unknown as import("../plugins/types/hooks-contract.js").HookRegistrySurface,
      registerHook: (
        hook: import("../plugins/types/hooks-contract.js").HookRegistration,
      ) => {
        const h = hook;
        hooksAdapter.addHook(
          h.name,
          h.handler as unknown as (payload: unknown) => unknown,
          "component-local",
          h.priority as "low" | "normal" | "high" | "critical" | undefined,
        );
      },
      capabilities: new Set<string>(),
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    };
  }
}

// Utility function for functional components
export function useSwissComponent<
  P extends BaseComponentProps,
  S extends BaseComponentState,
>(
  setup: (props: P) => S & { render: () => VNode },
): new (props: P) => SwissComponent<P, S> {
  return class FunctionalComponent extends SwissComponent<P, S> {
    constructor(props: P) {
      super(props);
      const setupResult = setup(props);
      Object.assign(this, setupResult);
    }

    private _render(): VNode | null {
      if (!this.render) return null;
      return (this as this & { render: () => VNode }).render();
    }
  };
}

// Export helpers for use in other files
export {
  LifecycleManager,
  SwissContext,
  createPortal,
  useSlot,
  serverInit,
  hydrateSSR as hydrate,
  renderToString,
};
