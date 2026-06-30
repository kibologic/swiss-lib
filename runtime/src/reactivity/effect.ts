/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { Signal } from "./signals.js";
import { logger } from "../utils/logger.js";
import { EffectStage } from "./types/index.js";

// Global context for tracking current effect
const moduleId = Math.random().toString(36).slice(2);

let _currentEffect: Effect | null = null;

export function getCurrentEffect(): Effect | null {
  return _currentEffect;
}
export function setCurrentEffect(eff: Effect | null) {
  _currentEffect = eff;
}

// Effect lifecycle stages are defined in the reactivity types barrel

/**
 * Effect class for reactive side effects
 */
type ReactiveObject = { __listeners?: Map<PropertyKey, Set<() => void>> };
type ReactiveListenerEntry = { reactiveObj: ReactiveObject; prop: PropertyKey; listener: () => void };

export class Effect {
  private fn: () => (() => void) | void;
  private stage = EffectStage.INITIAL;
  private __executing = false;
  private __trackedProps: Set<unknown> | null = null;
  private __reactiveListeners: Array<ReactiveListenerEntry> | null = null;
  cleanup: (() => void) | null = null;
  dependencies = new Set<Signal<unknown>>();

  private static readonly MAX_RERUNS = 100;
  private static _runCount = new WeakMap<Effect, number>();

  constructor(fn: () => (() => void) | void) {
    this.fn = fn;
    this.execute = this.execute.bind(this);
    this.execute();
  }

  execute() {
    if (this.stage === EffectStage.DISPOSED) {
      logger.reactivity("Effect execute() but effect is DISPOSED");
      return;
    }
    if (this.__executing) {
      logger.reactivity("Effect execute() re-entrancy guard");
      return;
    }

    // Guard against infinite reactive feedback loops (effect reads and writes the same signal)
    const runs = Effect._runCount.get(this) ?? 0;
    if (runs > Effect.MAX_RERUNS) {
      logger.error(
        `[SwissJS] Effect exceeded ${Effect.MAX_RERUNS} re-runs in a single tick. ` +
        `This usually means a reactive feedback loop (effect writes a signal it reads). ` +
        `Effect fn: ${this.fn?.name || "anonymous"}`,
      );
      return;
    }
    Effect._runCount.set(this, runs + 1);
    if (runs === 0) {
      queueMicrotask(() => Effect._runCount.delete(this));
    }

    logger.reactivity("Effect execute()");
    this.__executing = true;

    try {
      if (this.cleanup) {
        this.cleanup();
        this.cleanup = null;
      }

      this.clearDependencies();

      if (this.__trackedProps) {
        this.__trackedProps.clear();
      }

      // Set as current effect
      const prevEffect = _currentEffect;
      setCurrentEffect(this);
      this.stage = EffectStage.ACTIVE;

      try {
        // Execute effect function
        const result = this.fn();

        // Store cleanup function if returned
        if (typeof result === "function") {
          this.cleanup = result;
        }
      } catch (error) {
        // Handle errors during execution
        console.error("Effect execution error:", error);
      } finally {
        // Restore previous effect context
        setCurrentEffect(prevEffect);
      }
    } finally {
      this.__executing = false;
    }
  }

  /**
   * Clear all dependencies and unsubscribe
   */
  private clearDependencies() {
    for (const dep of this.dependencies) {
      dep.unsubscribe(this.execute);
    }
    this.dependencies.clear();

    if (this.__reactiveListeners) {
      for (const { reactiveObj, prop, listener } of this.__reactiveListeners) {
        const listenersMap = reactiveObj.__listeners;
        if (listenersMap?.has(prop)) {
          const listeners = listenersMap.get(prop);
          if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) listenersMap.delete(prop);
          }
        }
      }
      this.__reactiveListeners.length = 0;
    }
  }

  /**
   * Dispose of the effect and clean up resources
   */
  dispose() {
    if (this.stage === EffectStage.DISPOSED) return;

    this.stage = EffectStage.DISPOSED;
    this.clearDependencies();

    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
  }
}

/**
 * Create a reactive effect
 *
 * @param fn - The effect function to run
 * @returns Disposal function to stop the effect
 */
export function effect(fn: () => (() => void) | void): () => void {
  const eff = new Effect(fn);
  return () => eff.dispose();
}

/**
 * Register a cleanup function to run when dependencies change
 *
 * @param fn - Cleanup function
 */
export function onCleanup(fn: () => void) {
  const curr = getCurrentEffect();
  if (!curr) throw new Error("onCleanup must be called within an effect");
  const prevCleanup = curr.cleanup;
  curr.cleanup = () => {
    if (prevCleanup) prevCleanup();
    fn();
  };
}

/**
 * Track effect dependencies for signals
 */
export function trackEffect<T>(signal: Signal<T>) {
  const curr = getCurrentEffect();
  if (curr) {
    curr.dependencies.add(signal as unknown as Signal<unknown>);
    signal.subscribe(curr.execute);
  }
}

/**
 * Run a function without tracking dependencies
 *
 * @param fn - Function to run
 * @returns Result of the function
 */
export function untrack<T>(fn: () => T): T {
  const prevEffect = getCurrentEffect();
  setCurrentEffect(null);
  try {
    return fn();
  } finally {
    setCurrentEffect(prevEffect);
  }
}
