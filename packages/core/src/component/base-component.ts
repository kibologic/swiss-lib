/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-prototype-builtins */

import { type VNode } from "../vdom/vdom.js";
import { reactive } from "../reactivity/reactive.js";
import {
  type ContextMap,
  type BaseComponentProps,
  type BaseComponentState,
} from "./types/index.js";
import { LifecycleManager } from "./lifecycle.js";

// Forward declaration for scheduleUpdate
declare abstract class ComponentWithUpdate {
  scheduleUpdate?(): void;
}

export class BaseComponent<
  P extends BaseComponentProps = BaseComponentProps,
  S extends BaseComponentState = BaseComponentState,
> {
  public static requires: string[] = [];
  public static contextType?: symbol;
  public static isErrorBoundary: boolean = false;

  public props: P;
  public state: S;
  public context: ContextMap;

  protected _lifecycle: LifecycleManager;
  protected _isMounted: boolean = false;
  protected _isServer: boolean = typeof window === "undefined";
  protected _container: HTMLElement | null = null;
  protected _vnode: VNode | null = null;
  protected _errorHandlingPhase: boolean = false;

  constructor(props: P) {
    this.props = props;
    this.state = reactive({} as S) as S;
    this.context = new Map();
    this._lifecycle = new LifecycleManager();
  }

  // Basic lifecycle methods that can be overridden
  public handleMount(): void {}
  public handleUpdate(): void {}
  public handleDestroy(): void {}

  // Error handling methods
  public captureError(error: unknown, phase: string): void {
    console.error(`[Swiss] Error in ${phase}:`, error);
  }

  public resetErrorBoundary(): void {
    // Default implementation
  }

  // State management - supports both function and object updates (like React)
  setState(updater: (state: S) => Partial<S>): void;
  setState(updater: Partial<S>): void;
  setState(updater: ((state: S) => Partial<S>) | Partial<S>): void {
    let updates: Partial<S>;
    if (typeof updater === "function") {
      updates = updater(this.state);
    } else {
      updates = updater as Partial<S>;
    }

    // Set properties individually to trigger Proxy setters (reactivity)
    // The reactive system will automatically trigger effects (which call performUpdate)
    // No need to manually call scheduleUpdate() - that would cause double renders
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        const oldValue = (this.state as any)[key];
        const newValue = updates[key];

        // CRITICAL: Skip update if value hasn't actually changed (prevents infinite loops)
        // Use strict equality check - Proxy setter will also check, but this prevents unnecessary work
        if (oldValue === newValue) {
          continue;
        }

        // This assignment triggers the Proxy setter in reactive.ts
        // which notifies listeners and triggers the render effect
        (this.state as any)[key] = newValue;
      }
    }
  }

  // Context methods
  public setContext(key: symbol, value: unknown): void {
    this.context.set(key, value);
  }

  public getContext<T>(key: symbol): T | undefined {
    return this.context.get(key) as T;
  }
}
