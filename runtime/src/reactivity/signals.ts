/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import {
  Effect,
  trackEffect,
  getCurrentEffect,
  setCurrentEffect,
} from "./effect.js";
import type { SignalOptions } from "./types/index.js";
export type { SignalOptions } from "./types/index.js";

const defaultEquals = <T>(a: T, b: T) => a === b;

// Simple batch system for signal updates.
//
// In browser environments the module-level globals are safe (single user, single thread).
// In Node.js SSR, concurrent requests share the same module and can corrupt each other's
// batch state. When `async_hooks` is available we use AsyncLocalStorage to scope batch
// state per request. This is a progressive enhancement — it degrades gracefully when
// async_hooks is unavailable (e.g. bundled for the browser).
let _isBatching = false;
let _batchedSignals: Set<Signal<unknown>> = new Set();

type BatchContext = { isBatching: boolean; batchedSignals: Set<Signal<unknown>> };

let _als: { getStore(): BatchContext | undefined } | null = null;
if (typeof process !== "undefined" && typeof window === "undefined") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require("async_hooks") as typeof import("async_hooks");
    _als = new AsyncLocalStorage<BatchContext>();
  } catch {
    // async_hooks not available in this environment; fall back to module globals
  }
}

function getBatchContext(): BatchContext {
  if (_als) {
    const store = _als.getStore();
    if (store) return store;
  }
  return { isBatching: _isBatching, batchedSignals: _batchedSignals };
}

function setBatchContext(ctx: Partial<BatchContext>): void {
  if (_als) {
    const store = _als.getStore();
    if (store) {
      if (ctx.isBatching !== undefined) store.isBatching = ctx.isBatching;
      if (ctx.batchedSignals !== undefined) store.batchedSignals = ctx.batchedSignals;
      return;
    }
  }
  if (ctx.isBatching !== undefined) _isBatching = ctx.isBatching;
  if (ctx.batchedSignals !== undefined) _batchedSignals = ctx.batchedSignals;
}

function addToBatch<T>(signal: Signal<T>) {
  const ctx = getBatchContext();
  if (ctx.isBatching) {
    ctx.batchedSignals.add(signal as unknown as Signal<unknown>);
    setBatchContext({ batchedSignals: ctx.batchedSignals });
  }
}

function flushBatch() {
  const ctx = getBatchContext();
  if (ctx.batchedSignals.size > 0) {
    const signals = Array.from(ctx.batchedSignals);
    ctx.batchedSignals.clear();
    setBatchContext({ batchedSignals: ctx.batchedSignals });
    signals.forEach((signal) => signal.notify());
  }
}

// Simple security context system
let currentCapabilities = new Set<string>();

function hasCapability(capability: string): boolean {
  return currentCapabilities.has(capability);
}

function withSecurityContext(capabilities: string[], fn: () => void) {
  const prevCapabilities = new Set(currentCapabilities);
  capabilities.forEach((cap) => currentCapabilities.add(cap));
  try {
    fn();
  } finally {
    currentCapabilities = prevCapabilities;
  }
}

/**
 * Signal class for standalone reactive values
 */
export class Signal<T> {
  protected _value: T;
  protected subscribers = new Set<() => void>();
  private equals: (a: T, b: T) => boolean;
  private capability?: string;
  public readonly name?: string;

  constructor(initialValue: T, options: SignalOptions<T> = {}) {
    this._value = initialValue;
    this.equals = options.equals || defaultEquals;
    this.capability = options.capability;
    this.name = options.name;
  }

  get value(): T {
    // Track effect dependency if in effect context
    trackEffect(this);
    if (getCurrentEffect()) {
      // Security check
      if (this.capability && !hasCapability(this.capability)) {
        throw new Error(
          `Access denied to signal '${this.name}'. Missing capability: ${this.capability}`,
        );
      }
    }
    return this._value;
  }

  set value(newValue: T) {
    if (this.equals(this._value, newValue)) return;
    // Security check for writes
    if (this.capability && !hasCapability(this.capability)) {
      throw new Error(
        `Write access denied to signal '${this.name}'. Missing capability: ${this.capability}`,
      );
    }
    this._value = newValue;

    addToBatch(this);
    if (!getBatchContext().isBatching) {
      this.notify();
    }
  }

  /**
   * Update value using a function
   */
  update(updater: (value: T) => T) {
    this.value = updater(this.value);
  }

  /**
   * Subscribe to value changes
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.unsubscribe(callback);
  }

  /**
   * Unsubscribe from changes
   */
  unsubscribe(callback: () => void) {
    this.subscribers.delete(callback);
  }

  /**
   * Notify all subscribers of changes
   */
  notify() {
    // CRITICAL FIX: We must clone the Set into an array before iterating.
    // If we use this.subscribers.forEach directly, V8 will infinite loop because
    // effect.execute() clears its dependencies (deleting itself from this Set)
    // and then re-evaluates, which re-tracks the dependencies (adding itself back
    // to the end of this Set). V8's Set iterator visits re-added elements infinitely.
    const subs = Array.from(this.subscribers);
    subs.forEach((sub) => sub());
  }

  // Security-enhanced access
  withCapability(capability: string, fn: (value: T) => void) {
    withSecurityContext([capability], () => fn(this.value));
  }
}

/**
 * ComputedSignal class for derived reactive values
 */
export class ComputedSignal<T> extends Signal<T> {
  private computeFn: () => T;
  private dirty = true;
  private effect: Effect;

  constructor(computeFn: () => T, options?: SignalOptions<T>) {
    super(undefined as unknown as T, options);
    this.computeFn = computeFn;

    // Effect fires when any dependency changes: mark dirty, then notify downstream.
    // clearDependencies() runs before fn(), so deps are always re-tracked on next
    // .value read via updateValue(). No manual dep.subscribe() needed here.
    this.effect = new Effect(() => {
      this.dirty = true;
      this.notify();
    });

    this.updateValue();
  }

  get value(): T {
    if (this.dirty) {
      this.updateValue();
    }
    return super.value;
  }

  private updateValue() {
    const prevCurrentEffect = getCurrentEffect();
    try {
      // trackEffect() inside each signal's .value getter registers this.effect.execute
      // as a subscriber and adds the signal to this.effect.dependencies — no manual
      // subscribe/unsubscribe needed. effect.execute() calls clearDependencies() before
      // re-running, so stale subscriptions are cleaned up automatically.
      setCurrentEffect(this.effect);
      this._value = this.computeFn();
      this.dirty = false;
    } catch (error) {
      console.error("Error computing signal value:", error);
      this.dirty = false;
    } finally {
      setCurrentEffect(prevCurrentEffect);
    }
  }

  dispose() {
    this.effect.dispose();
  }
}

// Factory functions with enhanced options
export function signal<T>(
  initialValue: T,
  options?: SignalOptions<T>,
): Signal<T> {
  return new Signal(initialValue, options);
}

export function computed<T>(
  computeFn: () => T,
  options?: SignalOptions<T>,
): Signal<T> {
  return new ComputedSignal(computeFn, options);
}

/**
 * Create a signal bound to DOM element property
 */
export function bindToElement(
  element: HTMLElement,
  property: string,
  sig: Signal<unknown>,
  options: { twoWay?: boolean; signal?: AbortSignal } = {},
) {
  // Type-safe element access
  const el = element as unknown as Record<string, unknown>;

  // Initial sync
  el[property] = sig.value as unknown;

  // Element -> Signal (use AbortSignal for automatic cleanup)
  if (options.twoWay && typeof el[property] !== "undefined") {
    element.addEventListener("input", () => {
      sig.value = el[property] as unknown;
    }, { signal: options.signal });
  }

  // Signal -> Element.
  // Unsubscribe when the caller provides an AbortSignal (e.g. from component teardown).
  // Without cleanup the subscription outlives the element and leaks memory.
  const unsub = sig.subscribe(() => {
    el[property] = sig.value as unknown;
  });
  if (options.signal) {
    options.signal.addEventListener('abort', unsub, { once: true });
  }
}

/**
 * Batch multiple signal updates.
 * All signal notifications are deferred until the end of the batch, then fired once each.
 * Nested calls execute immediately inside the outer batch.
 */
export function batch<T>(fn: () => T): T {
  const ctx = getBatchContext();
  if (ctx.isBatching) {
    return fn();
  }

  setBatchContext({ isBatching: true });
  try {
    return fn();
  } finally {
    setBatchContext({ isBatching: false });
    flushBatch();
  }
}

/**
 * Enter batch mode for manual start/end batching.
 * Prefer `batch()` over this for most cases.
 */
export function startBatch(): void {
  setBatchContext({ isBatching: true });
}

/**
 * Flush all pending signal notifications and exit batch mode.
 * Must be paired with `startBatch()`.
 */
export function endBatch(): void {
  setBatchContext({ isBatching: false });
  flushBatch();
}

/**
 * Serialize signal state for SSR
 */
export function serializeSignalState(
  component: unknown,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  // Capture all signal values from component
  const comp = component as unknown as {
    _signals?: Record<string, Signal<unknown>>;
    _computed?: Record<string, Signal<unknown>>;
  };
  if (comp._signals) {
    for (const [key, signal] of Object.entries(
      comp._signals as Record<string, Signal<unknown>>,
    )) {
      state[key] = signal.value as unknown;
    }
  }

  // Capture computed values
  if (comp._computed) {
    for (const [key, computed] of Object.entries(
      comp._computed as Record<string, Signal<unknown>>,
    )) {
      state[key] = computed.value as unknown;
    }
  }

  return state;
}

/**
 * Deserialize signal state for hydration
 */
export function deserializeSignalState(
  root: unknown,
  serialized: Record<string, unknown>,
): void {
  if (!root || !serialized) return;

  // Find all signals in the component tree and update their values
  const walk = (node: unknown) => {
    const n = node as {
      _signals?: Record<string, Signal<unknown>>;
      _computed?: Record<string, Signal<unknown>>;
      children?: unknown[];
    };
    if (n._signals) {
      for (const [key, signal] of Object.entries(
        n._signals as Record<string, Signal<unknown>>,
      )) {
        if (key in serialized) {
          signal.value = serialized[key] as unknown;
        }
      }
    }

    if (n._computed) {
      for (const [key, computed] of Object.entries(
        n._computed as Record<string, Signal<unknown>>,
      )) {
        if (key in serialized) {
          computed.value = serialized[key] as unknown;
        }
      }
    }

    if (n.children) {
      n.children.forEach(walk);
    }
  };

  walk(root as unknown);
}
