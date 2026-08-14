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
import type { VNodeBase } from "../vdom/types/index.js";

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
import { saveFocusState, restoreFocusState } from "./focus-guard.js";
import { SwissContext, cleanupContextSubscriptions } from "./context.js";
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

// Lifecycle helpers (split from this file to stay within 700-line limit)
import {
  mountComponent,
  unmountComponent,
} from "./component-lifecycle.js";

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
  /** Set by ReactivityManager when a signal-driven microtask commit is queued. Read by
   *  UpdateManager.scheduleUpdate() to absorb redundant explicit update calls that would
   *  otherwise cause a second full reconciliation pass in the same event handler tick. */
  public _signalCommitPending: boolean = false;
  /** True between the start of mount() and the first DOM commit — blocks commitVNode(). */
  protected _mounting: boolean = false;
  /** When true, the next performUpdate() call is a no-op (used to skip programmatic updates
   *  that would conflict with an already-committed signal-driven render). */
  protected _skipNextUpdate: boolean = false;

  constructor(props: P, options: SwissComponentOptions = {}) {
    super(props);
    // Ensure props are properly set (fix for props inheritance bug)
    if (!this.props) this.props = props;
    // FRAME-006: this line unconditionally called document.createElement("div"), which
    // means EVERY SwissComponent -- not just ones that touch the DOM in render() --
    // required a global `document` just to be constructed. renderToString()/serverInit()
    // are the framework's own SSR entry points and construct real component instances;
    // in an actual Node server process (no jsdom), that construction threw
    // "document is not defined", and renderToString's own try/catch (renderer.ts)
    // silently swallowed it and returned "" for that component -- the exact "renders as
    // empty" symptom this task exists to close, but from environment, not identity.
    // `this.element` has no other reader anywhere in this package (verified by grep) --
    // it exists but nothing downstream depends on it being a real DOM node when there is
    // no DOM to build one from.
    this.element = typeof document !== "undefined"
      ? document.createElement("div")
      : ({} as HTMLElement);
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
      const self = this as Record<string, unknown>;
      if (lifecycleMetadata.mount && Array.isArray(lifecycleMetadata.mount)) {
        lifecycleMetadata.mount.forEach((hook: { method: string }) => {
          if (hook.method && typeof self[hook.method] === "function") {
            const fn = self[hook.method] as () => void;
            this._lifecycle.on("mounted", () => fn.call(this));
          }
        });
      }
      if (lifecycleMetadata.update && Array.isArray(lifecycleMetadata.update)) {
        lifecycleMetadata.update.forEach((hook: { method: string }) => {
          if (hook.method && typeof self[hook.method] === "function") {
            const fn = self[hook.method] as () => void;
            this._lifecycle.on("updated", () => fn.call(this));
          }
        });
      }
      if (lifecycleMetadata.unmount && Array.isArray(lifecycleMetadata.unmount)) {
        lifecycleMetadata.unmount.forEach((hook: { method: string }) => {
          if (hook.method && typeof self[hook.method] === "function") {
            const fn = self[hook.method] as () => void;
            this._lifecycle.on("unmounted", () => fn.call(this));
          }
        });
      }
    }

    // Create plugin context via manager
    this.pluginManager.createPluginContext();
  }

  // ===== Lifecycle Hooks =====
  public handleMount(): void {}
  public handleUpdate(): void {}
  public handleDestroy(): void {}

  onMount?(): void | Promise<void>;
  mounted?(): void;
  unmounted?(): void;

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

    if (typeof this.onMount === "function") {
      this._lifecycle.on("mounted", async () => {
        try {
          await this.onMount!();
        } catch (error) {
          this.captureError(error, "mounted");
        }
      });
    }
    if (typeof this.mounted === "function") {
      this._lifecycle.on("mounted", () => {
        try {
          this.mounted!();
        } catch (error) {
          this.captureError(error, "mounted");
        }
      });
    }
  }

  public validateCapabilities(): Promise<void> {
    return this.capabilityManager.validateCapabilities();
  }

  public clearCapabilityCache(): void {
    this.capabilityManager.clearCache();
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

  public safeRender(): VNode | null {
    if (this.hasCapturedErrorInfo()) {
      return this.renderErrorFallback();
    }

    try {
      void this.executeHookPhase("beforeRender");
      const vnode = this.render();
      void this.executeHookPhase("afterRender");
      return vnode;
    } catch (error) {
      this.captureError(error, "render");
      return this.renderErrorFallback();
    }
  }

  public commitVNode(newVNode: VNode): void {
    if (this._mounting) return;
    const container = this._container;
    const oldVNode = this._vnode;

    // Resolve the existing DOM node.
    // dom-creation.ts calls initialize() (and therefore setupReactivity()) WITHOUT going
    // through mount(container), so _container is never set for child components.
    // We must still be able to commit reactive updates using the existing DOM node.
    //
    // Same staleness hazard as reconcileChildren's oldChildren loop (see
    // reconciliation.ts): oldVNode.dom is tied to a specific vnode object
    // from a past render, and can go stale if a separate commit path (e.g.
    // the explicit scheduleUpdate()/performUpdate() route vs. this
    // signal-effect-driven commitVNode route) already replaced this
    // component's root element without that old vnode object ever being
    // told. this._domNode is a plain instance field every commit path
    // updates directly, so it can't carry that same staleness — prefer it,
    // and only trust oldVNode.dom when it's still genuinely connected to
    // the document.
    const oldVNodeBase = typeof oldVNode === "object" && oldVNode !== null ? oldVNode as VNodeBase : null;
    const oldVNodeDom = oldVNodeBase?.dom as Node | undefined;
    const oldVNodeDomIsLive = oldVNodeDom != null && oldVNodeDom.isConnected;
    const existingDom: Node | null =
      this._domNode ?? (oldVNodeDomIsLive ? oldVNodeDom : null) ?? null;

    if (!container && !existingDom) return;

    const newVNodeBase = typeof newVNode === "object" && newVNode !== null ? newVNode as VNodeBase : null;
    if (newVNodeBase && typeof newVNodeBase.type === "function") {
      newVNodeBase.__componentInstance = this;
    }

    // Preserve input focus across reconciliation (replaceChild destroys focused DOM nodes)
    const focusState = saveFocusState();

    // STUCK-LOADING FIX (dual-commit-pipeline, 2026-07-18): every other commit strategy
    // (update-strategies.ts's updateWithDomNode/updateChildComponent/handleNoUpdatePath/
    // updateRootComponent) wraps its updateDOMNode()/renderToDOM() call in untrack() --
    // this is the one path that didn't. commitVNode is invoked from inside the signal
    // effect's queued microtask (reactivity-setup.ts), a context where the module-level
    // _currentEffect ambient tracking pointer is not guaranteed clean (e.g. a nested
    // component's forced render recursing back through an active effect elsewhere in the
    // same microtask-drain). Wrap it to match the established pattern rather than being
    // the sole exception to it.
    untrack(() => {
      if (existingDom) {
        updateDOMNode(existingDom, newVNode);
        if (newVNodeBase) newVNodeBase.dom = existingDom as HTMLElement | Text;
      } else {
        renderToDOM(newVNode, container!);
        if (newVNodeBase && container!.firstChild) {
          newVNodeBase.dom = container!.firstChild as HTMLElement | Text;
        }
      }
    });

    this._vnode = newVNode;
    this._domNode = (newVNodeBase?.dom as Node | null) ?? this._domNode;

    restoreFocusState(focusState);
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
    // FRAME-005: a bare Fragment returned as a component's OWN render() output cannot be
    // re-rendered. createDOMNode (dom-creation.ts) builds a Fragment as a real
    // DocumentFragment, but a DocumentFragment's children move into the real parent the
    // instant it's inserted -- the fragment node itself is left permanently empty and,
    // critically, its .parentNode stays null forever (it was never itself attached to
    // anything; only its former children were). applyRenderedOutput
    // (dom-update-refs.ts), the function every component re-render goes through, needs
    // `hostDom.parentNode` to either replace or append the freshly rendered content --
    // for a Fragment-rooted component that is always null, so on re-render the new DOM
    // gets built and then silently discarded, never inserted anywhere. This is a general
    // reconciler limitation (any component whose render() returns a bare Fragment as its
    // sole output hits it, not just ErrorBoundary/renderWithBoundary specifically -- filed
    // as its own finding, not fixed here, since fixing it generally means giving every
    // Fragment-rooted component a stable real anchor node to reconcile against, a
    // reconciler-wide change well beyond this task's bounded scope).
    //
    // For exactly one child, a Fragment adds no semantic value anyway -- the child IS the
    // content -- so returning it directly avoids the broken path entirely rather than
    // working around it. Zero or 2+ children still route through the Fragment wrapper and
    // still carry this limitation; that shape happens to be unused by every current
    // consumer of renderWithBoundary (ErrorBoundary passes exactly one child at every real
    // call site in this codebase).
    if (children.length === 1) {
      return children[0];
    }
    return createElement(Fragment, {}, ...children);
  }

  // ===== Mounting & Unmounting =====
  // Implementation delegated to component-lifecycle.ts to keep this file
  // within the 700-line hard limit.

  public mount(container: HTMLElement): void {
    mountComponent(this, container);
  }

  public unmountComponent(): void {
    unmountComponent(this);
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
    void element;
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
// FRAME-006-A: createPortal/useSlot deliberately NOT re-exported here. component/index.ts
// already does BOTH `export * from './component.js'` (which used to include this file's own
// re-export of them) AND `export * from './portals.js'` (their original declaration). At
// runtime this resolves fine (both paths alias the same underlying binding) -- but TypeScript's
// declaration (.d.ts) emitter drops a name entirely when it sees it re-exported via two
// different `export *` sources in the same aggregating barrel, even when they're the same
// binding. That's why createPortal/useSlot were present and working in the compiled JS
// (verified: `import { createPortal } from '.../dist/index.js'` returns a real function, even
// on the currently-published @swissjs/core@1.2.14) but ABSENT from dist/index.d.ts -- silently
// untypeable, which is exactly the pressure that pushed alpine-shell toward building its own
// portal instead of importing this one (FABLE-BOUNDARY-001). The single, correct export path is
// portals.ts's own -- don't re-add a second one here.
export {
  LifecycleManager,
  SwissContext,
  serverInit,
  hydrateSSR as hydrate,
  renderToString,
};
