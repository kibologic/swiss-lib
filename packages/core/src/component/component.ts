/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Renderer imports
import { renderToDOM, updateDOMNode } from "../renderer/renderer.js";
import {
  type VNode,
  createElement,
  Fragment,
  renderToString,
} from "../vdom/vdom.js";

// Reactivity imports
import { reactive } from "../reactivity/reactive.js";
import { untrack } from "../reactivity/effect.js";
import { type EffectDisposer } from "../reactivity/types/index.js";

// Component system imports
import { BaseComponent } from "./base-component.js";
import {
  type BaseComponentProps,
  type BaseComponentState,
  type SwissComponentOptions,
  type SwissErrorInfo,
  type ComponentHook,
} from "./types/index.js";
import { LifecycleManager } from "./lifecycle.js";
import { SwissContext, cleanupContextSubscriptions } from "./context.js";
import { createPortal, useSlot } from "./portals.js";
import { serverInit, hydrateSSR } from "./ssr.js";
import {
  getLifecycleMetadata,
  OnMount,
  OnUpdate,
  OnUnmount,
} from "./decorators/index.js";
import { logger } from "../utils/logger.js";

// Plugin & security imports
import type { Plugin, PluginContext } from "../plugins/pluginInterface.js";
import { CapabilityManager } from "../security/capability-manager.js";
import {
  FenestrationRegistry,
  type FenestrationContext,
} from "../fenestration/registry.js";

// Devtools imports
import {
  getDevtoolsBridge,
  isDevtoolsEnabled,
  isTelemetryEnabled,
} from "../devtools/bridge.js";
import { getRemediationMessage } from "../error/remediation.js";

// Manager imports
import { UpdateManager } from "./update-manager.js";
import { ReactivityManager } from "./reactivity-setup.js";
import { CapabilityManagerComponent } from "./capability-manager-component.js";
import { PluginManagerComponent } from "./plugin-manager-component.js";

export class SwissComponent<
  P extends BaseComponentProps = BaseComponentProps,
  S extends BaseComponentState = BaseComponentState,
> extends BaseComponent<P, S> {
  public static requires: string[] = [];
  public static contextType?: symbol;
  public static isErrorBoundary: boolean = false;

  public error: SwissErrorInfo | null = null;
  public element: HTMLElement;
  protected _devtoolsId: string;

  // Manager instances
  private updateManager: UpdateManager;
  private reactivityManager: ReactivityManager<S>;
  private capabilityManager: CapabilityManagerComponent;
  private pluginManager: PluginManagerComponent;

  // Core component state
  protected _lifecycle: LifecycleManager = new LifecycleManager();
  protected _hooks: ComponentHook[] = [];
  protected _isMounted: boolean = false;
  protected _isServer: boolean = typeof window === "undefined";
  protected _container: HTMLElement | null = null;
  protected _domNode: Node | null = null;
  protected _vnode: VNode | null = null;
  protected _portals: Map<HTMLElement, VNode> = new Map();
  protected _errorHandlingPhase: boolean = false;
  protected _childErrors: Map<SwissComponent, SwissErrorInfo> = new Map();
  protected _slotContent: Map<string, VNode[]> = new Map();
  protected _initialized: boolean = false;
  /** Captured error for fallback UI; never shadowed by subclass state (e.g. state { let error }) */
  protected _capturedError: SwissErrorInfo | null = null;

  constructor(props: P, options: SwissComponentOptions = {}) {
    super(props);
    // Ensure props are properly set (fix for props inheritance bug)
    if (!this.props) this.props = props;
    this.element = document.createElement("div");
    // Create a stable devtools ID for this instance (dev-only usage)
    this._devtoolsId = `cmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;

    // Initialize managers
    this.updateManager = new UpdateManager(this);
    this.reactivityManager = new ReactivityManager<S>(this);
    this.capabilityManager = new CapabilityManagerComponent(this);
    this.pluginManager = new PluginManagerComponent(this, this._lifecycle);

    // Apply options
    if (options.plugins) {
      this.pluginManager.setPlugins(options.plugins);
    }

    // Mark as error boundary if specified
    if (options.errorBoundary) {
      (this.constructor as typeof SwissComponent).isErrorBoundary = true;
    }

    // Apply decorator metadata (lifecycle, render, etc.)
    const lifecycleMetadata = getLifecycleMetadata(this);
    if (lifecycleMetadata && typeof lifecycleMetadata === "object") {
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

    // Create plugin context via manager
    this.pluginManager.createPluginContext();
  }

  // ===== Lifecycle Hooks =====
  public handleMount(): void {
    // Custom mount logic
  }

  public handleUpdate(): void {
    // Custom update logic
  }

  public handleDestroy(): void {
    // Custom destroy logic
  }

  // ===== Error Boundary System =====
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
      return true;
    }

    if (this._parent) {
      return this._parent.captureChildError(this, errorInfo);
    }

    return false;
  }

  resetErrorBoundary(): void {
    if (this.error || this._capturedError) {
      this.error = null;
      this._capturedError = null;
      this._childErrors.clear();
      this.scheduleUpdate();
    }

    this._children.forEach((child) => {
      if ((child.constructor as typeof SwissComponent).isErrorBoundary) {
        child.resetErrorBoundary();
      }
    });
  }

  public captureError(error: unknown, phase: string): void {
    if (this._errorHandlingPhase) return;
    this._errorHandlingPhase = true;

    const normalizedError =
      error === undefined || error === null
        ? new Error(`${phase}: component threw ${String(error)}`)
        : error;

    const errorInfo: SwissErrorInfo = {
      error: normalizedError,
      phase,
      component: this,
      timestamp: Date.now(),
    };

    this.error = errorInfo;

    console.error(
      `Error in component ${this.constructor.name} during ${phase}:`,
      error,
    );

    if (isDevtoolsEnabled()) {
      try {
        const required =
          (this.constructor as typeof SwissComponent).requires ?? [];
        const advice = getRemediationMessage(error, phase, this, required);
        getDevtoolsBridge().recordEvent({
          t: Date.now(),
          type: "error",
          msg: `${this._devtoolsId}:${advice.message}`,
        });
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

    let boundary = this._parent;
    while (boundary && !boundary.captureChildError(this, errorInfo)) {
      boundary = boundary._parent;
    }

    if (!boundary) {
      this.dispatchGlobalError(error, phase);
    }

    this._errorHandlingPhase = false;
  }

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

  // ===== Lifecycle Management =====
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

  public async executeHookPhase(
    phase: string,
    error?: Error | unknown,
  ): Promise<void> {
    await this._lifecycle.executeHookPhase(phase, this, error);
  }

  // ===== Initialization =====
  public initialize(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.reactivityManager.ensureStateReactive();
    this.setupReactivity();
    this.loadPlugins();
    this.validateCapabilities();

    // Hook onMount() into the mounted lifecycle phase if it exists
    if (typeof (this as any).onMount === "function") {
      this._lifecycle.on("mounted", async () => {
        try {
          await (this as any).onMount();
        } catch (error) {
          console.error(
            `[Component] Error in onMount() for ${this.constructor.name}:`,
            error,
          );
          this.captureError(error, "mounted");
        }
      });
    }
    // Swiss syntax: mount { } compiles to private mounted() { } — call it on mounted (not mount(container))
    if (typeof (this as any).mounted === "function") {
      this._lifecycle.on("mounted", () => {
        try {
          (this as any).mounted();
        } catch (error) {
          console.error(
            `[Component] Error in mounted() for ${this.constructor.name}:`,
            error,
          );
          this.captureError(error, "mounted");
        }
      });
    }
  }

  public validateCapabilities(): Promise<void> {
    return this.capabilityManager.validateCapabilities();
  }

  // ===== Capabilities (Fenestration) - Delegated =====
  public fenestrate<T>(capabilityId: string, ...params: unknown[]): T | null {
    return this.capabilityManager.fenestrate<T>(capabilityId, ...params);
  }

  public async fenestrateAsync<T>(
    capabilityId: string,
    ...params: unknown[]
  ): Promise<T | null> {
    return this.capabilityManager.fenestrateAsync<T>(capabilityId, ...params);
  }

  // ===== Plugin Management - Delegated =====
  public async loadPlugins(): Promise<void> {
    return this.pluginManager.loadPlugins();
  }

  // ===== Reactivity - Delegated =====
  public setupReactivity(): void {
    this.reactivityManager.setupReactivity();
  }

  public trackEffect(disposer: EffectDisposer): void {
    this.reactivityManager.trackEffect(disposer);
  }

  public clearEffects(): void {
    this.reactivityManager.clearEffects();
  }

  // ===== Update Management - Delegated =====
  /** Schedule a re-render (RAF). Use this or scheduleUpdate() after state changes. */
  public update(): void {
    this.updateManager.scheduleUpdate();
  }

  public scheduleUpdate(): void {
    this.updateManager.scheduleUpdate();
  }

  public performUpdate(): void {
    this.updateManager.performUpdate();
  }

  // ===== Rendering =====
  public render(): VNode {
    // Base render method, should be overridden by subclasses
    return createElement("div", {}, "Please implement the render method");
  }

  /** True only when we have framework error-boundary info, not subclass state (e.g. state { let error: string }) */
  private hasCapturedErrorInfo(): boolean {
    if (this._capturedError) return true;
    const e = this.error;
    return e != null && typeof e === "object" && "phase" in e && "error" in e;
  }

  public safeRender(): VNode {
    if (this.hasCapturedErrorInfo()) {
      return this.renderErrorFallback();
    }

    try {
      void this.executeHookPhase("beforeRender");
      const vnode = this.render();
      void this.executeHookPhase("afterRender");
      if (vnode === undefined || vnode === null) {
        this.captureError(
          vnode === undefined
            ? new Error("render() returned undefined")
            : new Error("render() returned null"),
          "render",
        );
        return this.renderErrorFallback();
      }
      return vnode;
    } catch (error) {
      this.captureError(error, "render");
      return this.renderErrorFallback();
    }
  }

  public commitVNode(newVNode: VNode): void {
    if ((this as any)._mounting) return;
    const container = this._container;
    const oldVNode = this._vnode;

    if (!container) return;

    if (
      typeof newVNode === "object" &&
      newVNode !== null &&
      "type" in newVNode &&
      typeof (newVNode as any).type === "function"
    ) {
      (newVNode as any).__componentInstance = this;
    }

    if (oldVNode && (oldVNode as any).dom) {
      updateDOMNode((oldVNode as any).dom, newVNode);
      (newVNode as any).dom = (oldVNode as any).dom;
    } else {
      renderToDOM(newVNode, container);
      if (container.firstChild) {
        (newVNode as any).dom = container.firstChild;
      }
    }

    this._vnode = newVNode;
    this._domNode = (newVNode as any).dom ?? (this as any)._domNode;
  }

  public renderErrorFallback(): VNode {
    const info =
      this._capturedError ??
      (this.error != null &&
      typeof this.error === "object" &&
      "phase" in this.error &&
      "error" in this.error
        ? (this.error as SwissErrorInfo)
        : null);
    const phase = info?.phase ?? "N/A";
    const detail: string =
      info?.error instanceof Error
        ? (info.error.stack ?? info.error.message)
        : info?.error != null
          ? String(info.error)
          : "No error details available";
    return createElement(
      "div",
      { style: "border: 1px solid red; padding: 10px; color: red;" },
      createElement("h3", {}, "Component Error"),
      createElement("p", {}, `Phase: ${phase}`),
      createElement("pre", { style: "white-space: pre-wrap;" }, detail),
    );
  }

  public renderWithBoundary(children: VNode[]): VNode {
    return createElement(Fragment, {}, ...children);
  }

  // ===== Mounting & Unmounting =====
  public mount(container: HTMLElement): void {
    if (this._isMounted) return;
    if (!container || !(container instanceof HTMLElement)) {
      logger.error(
        `mount() called for ${this.constructor.name} with invalid container:`,
        container,
      );
      return;
    }

    this._container = container;

    // Prevent the initial render effect from committing DOM until beforeMount has fired.
    (this as any)._mounting = true;

    // Initialize reactivity BEFORE any DOM commit. The render effect will execute immediately.
    this.initialize();
    this.executeHookPhase("beforeMount");

    // Allow commits now that beforeMount has run.
    (this as any)._mounting = false;

    // Perform the first DOM commit explicitly (reactivity is now established for subsequent updates).
    untrack(() => {
      this.commitVNode(this.safeRender());
    });

    this._isMounted = true;
    this.bindEventHandlers();
    this.executeHookPhase("mounted");

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
        /* ignore */
      }
    }
  }

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
        logger.warn(
          `Event handler method '${handler.method}' not found on ${this.constructor.name}`,
        );
        continue;
      }

      if (
        handler.options.capability &&
        !CapabilityManager.has(handler.options.capability, this)
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
          (method as (...args: unknown[]) => unknown).call(this, event);
        } catch (error) {
          this.captureError(error, `event:${handler.eventType}`);
        }
      };

      if (handler.selector) {
        const elements = this._container.querySelectorAll(handler.selector);
        elements.forEach((element) => {
          element.addEventListener(handler.eventType, boundHandler, {
            capture: handler.options.capture,
            once: handler.options.once,
            passive: handler.options.passive,
          });
        });
      } else {
        this._container.addEventListener(handler.eventType, boundHandler, {
          capture: handler.options.capture,
          once: handler.options.once,
          passive: handler.options.passive,
        });
      }
    }
  }

  public unmountComponent(): void {
    if (!this._isMounted) return;

    try {
      this.executeHookPhase("beforeUnmount");
      if (isDevtoolsEnabled()) {
        try {
          getDevtoolsBridge().onComponentUnmount(this._devtoolsId);
        } catch {
          /* ignore */
        }
      }
      cleanupContextSubscriptions(this);
      this.clearEffects();
      this.capabilityManager.clearCache();
      this._children = [];
      this._parent = null;

      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }

      this._portals.forEach((_, portalContainer) => {
        if (portalContainer && portalContainer.innerHTML !== undefined)
          portalContainer.innerHTML = "";
      });

      this._hooks = [];
      // Swiss syntax: unmount { } compiles to private unmount() { } — call it before teardown
      if (typeof (this as any).unmount === "function") {
        try {
          (this as any).unmount();
        } catch (error) {
          console.error(
            `[Component] Error in unmount() for ${this.constructor.name}:`,
            error,
          );
        }
      }
      this.executeHookPhase("unmounted");
      this.state = reactive({} as S) as S;
      this._isMounted = false;
    } catch (error) {
      this.captureError(error, "destroy");
    }
  }

  // ===== SSR & Hydration =====
  public internalHydrate(): Promise<void> {
    return Promise.resolve();
  }

  public internalUnmount(): Promise<void> {
    return Promise.resolve();
  }

  async renderToString() {
    const html = await this.renderInternal();
    return html;
  }

  async hydrate(element: HTMLElement) {
    await this.internalHydrate();
  }

  async unmount() {
    await this.internalUnmount();
  }

  public renderInternal(): Promise<string> {
    return Promise.resolve("");
  }

  // ===== Context Management =====
  public getChildComponents(): SwissComponent[] {
    return this._children;
  }

  public provideContext<T>(key: symbol, value: T): void {
    this.context.set(key, value);
  }

  public useContext<T>(key: symbol): T | undefined {
    if (this.context.has(key)) {
      return this.context.get(key) as T;
    }

    let current: SwissComponent | null = this._parent;
    while (current) {
      if (current.context.has(key)) {
        return current.context.get(key) as T;
      }
      current = current._parent;
    }
    return undefined;
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
