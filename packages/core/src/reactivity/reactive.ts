/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Listener, PropertyKey, ReactiveObject } from "./types/index.js";
import { getCurrentEffect, type Effect } from "./effect.js";
export type { EffectDisposer } from "./types/index.js";

/**
 * Create a reactive object that notifies listeners when properties change
 */
export function reactive<T extends object>(target: T): T {
  const reactiveObj = target as ReactiveObject;

  // Initialize listener maps if they don't exist
  if (!reactiveObj.__listeners) {
    Object.defineProperty(reactiveObj, "__listeners", {
      value: new Map<PropertyKey, Set<Listener>>(),
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  if (!reactiveObj.__globalListeners) {
    Object.defineProperty(reactiveObj, "__globalListeners", {
      value: new Set<Listener>(),
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  return new Proxy(target, {
    get(obj: T, prop: PropertyKey) {
      // Track effect dependency if there's a current effect
      const currentEffect = getCurrentEffect();
      if (
        currentEffect &&
        prop !== "__listeners" &&
        prop !== "__globalListeners" &&
        prop !== "__reactiveTarget"
      ) {
        // Store effect reference on the reactive object for tracking
        const reactiveObj = obj as unknown as ReactiveObject;
        if (!reactiveObj.__listeners) {
          Object.defineProperty(reactiveObj, "__listeners", {
            value: new Map<PropertyKey, Set<Listener>>(),
            writable: false,
            enumerable: false,
            configurable: false,
          });
        }

        // Track which properties this effect has accessed during this execution
        // Use a WeakMap to store per-effect tracking state
        if (!(currentEffect as any).__trackedProps) {
          (currentEffect as any).__trackedProps = new Set();
        }
        const trackedProps = (currentEffect as any)
          .__trackedProps as Set<string>;
        const propKey = `${String(prop)}`;

        // Only add listener once per property per effect execution
        if (!trackedProps.has(propKey)) {
          trackedProps.add(propKey);

          const listenersMap = reactiveObj.__listeners;
          if (listenersMap) {
            if (!listenersMap.has(prop)) {
              listenersMap.set(prop, new Set());
            }
            const listeners = listenersMap.get(prop);
            if (listeners) {
              // Check if we already have a listener for this effect
              let alreadyTracked = false;
              for (const listener of listeners) {
                if ((listener as any).__effect === currentEffect) {
                  alreadyTracked = true;
                  break;
                }
              }

              if (!alreadyTracked) {
                // Create a bound execute function with metadata
                // Use a debounce-like mechanism to prevent infinite loops
                const effectExecute = (() => {
                  // Only execute if effect is still active and not currently executing
                  // Use requestAnimationFrame to debounce rapid updates
                  if (
                    !(currentEffect as any).__scheduled &&
                    !(currentEffect as any).__executing
                  ) {
                    console.log(
                      `[Reactive] Scheduling effect execution for property ${String(prop)}`,
                    );
                    (currentEffect as any).__scheduled = true;
                    requestAnimationFrame(() => {
                      (currentEffect as any).__scheduled = false;
                      // Execute the effect (it will check if disposed internally)
                      if (!(currentEffect as any).__executing) {
                        console.log(
                          `[Reactive] Executing effect from requestAnimationFrame for property ${String(prop)}`,
                        );
                        currentEffect.execute();
                      } else {
                        console.log(
                          `[Reactive] Effect already executing, skipping for property ${String(prop)}`,
                        );
                      }
                    });
                  } else {
                    console.log(
                      `[Reactive] Effect already scheduled or executing, skipping for property ${String(prop)}`,
                    );
                  }
                }) as Listener & { __effect?: typeof currentEffect };
                effectExecute.__effect = currentEffect;
                listeners.add(effectExecute);

                // Track this listener so we can remove it when effect clears dependencies
                if (!(currentEffect as any).__reactiveListeners) {
                  (currentEffect as any).__reactiveListeners = new Set();
                }
                (currentEffect as any).__reactiveListeners.add({
                  reactiveObj,
                  prop,
                  listener: effectExecute,
                });
              }
            }
          }
        }
      }

      // Return the actual value
      return (obj as unknown as Record<PropertyKey, unknown>)[prop];
    },

    set(obj: T, prop: PropertyKey, value: unknown) {
      console.log(
        `[Reactive] Proxy set trap called for property: ${String(prop)}, value:`,
        value,
      );
      const record = obj as unknown as Record<PropertyKey, unknown>;
      const oldValue = record[prop];
      console.log(`[Reactive] Old value:`, oldValue, `New value:`, value);

      // Set the new value
      record[prop] = value;

      // Notify listeners only if value actually changed
      if (oldValue !== value) {
        console.log(
          `[Reactive] Value changed, calling notifyListeners for property: ${String(prop)}`,
        );
        notifyListeners(obj as unknown as ReactiveObject, prop);
      } else {
        console.log(
          `[Reactive] Value unchanged, skipping notifyListeners for property: ${String(prop)}`,
        );
      }

      return true;
    },
  });
}

/**
 * Watch for changes on a specific property
 */
export function watch<T extends object>(
  obj: T,
  property: keyof T,
  callback: (newValue: unknown, oldValue: unknown) => void,
): () => void {
  const reactiveObj = obj as ReactiveObject;

  if (!reactiveObj.__listeners) {
    throw new Error("Object is not reactive. Use reactive() first.");
  }

  const prop = property as PropertyKey;

  if (!reactiveObj.__listeners.has(prop)) {
    reactiveObj.__listeners.set(prop, new Set());
  }

  const currentValue = reactiveObj[prop];

  const listener = () => {
    const newValue = reactiveObj[prop];
    callback(newValue, currentValue);
  };

  reactiveObj.__listeners.get(prop)!.add(listener);

  // Return unsubscribe function
  return () => {
    reactiveObj.__listeners?.get(prop)?.delete(listener);
  };
}

/**
 * Watch for any changes on the object
 */
export function watchAll<T extends object>(
  obj: T,
  callback: () => void,
): () => void {
  const reactiveObj = obj as ReactiveObject;

  if (!reactiveObj.__globalListeners) {
    throw new Error("Object is not reactive. Use reactive() first.");
  }

  reactiveObj.__globalListeners.add(callback);

  // Return unsubscribe function
  return () => {
    reactiveObj.__globalListeners?.delete(callback);
  };
}

/**
 * Create a computed property that updates when dependencies change
 */
export function computed<T>(fn: () => T): { value: T } {
  let value = fn();
  let isStale = false;

  const computedRef = {
    get value() {
      if (isStale) {
        value = fn();
        isStale = false;
      }
      return value;
    },
  };

  // This is a simplified version - in a full implementation,
  // we'd track dependencies automatically
  return computedRef;
}

/**
 * Notify all listeners for a property change
 */
function notifyListeners(obj: ReactiveObject, property: PropertyKey): void {
  console.log(
    `[Reactive] notifyListeners called for property: ${String(property)}`,
  );

  // Notify property-specific listeners
  const propertyListeners = obj.__listeners?.get(property);
  if (propertyListeners) {
    console.log(
      `[Reactive] Found ${propertyListeners.size} listeners for property ${String(property)}`,
    );
    propertyListeners.forEach((listener, index) => {
      console.log(
        `[Reactive] Calling listener ${index} for property ${String(property)}`,
      );
      listener();
    });
  } else {
    console.log(
      `[Reactive] No listeners found for property ${String(property)}`,
    );
  }

  // Notify global listeners
  if (obj.__globalListeners) {
    console.log(
      `[Reactive] Notifying ${obj.__globalListeners.size} global listeners`,
    );
    obj.__globalListeners.forEach((listener) => listener());
  }
}

/**
 * Effect function that runs when reactive dependencies change
 */
export function effect(fn: () => void): () => void {
  // This is a simplified version
  // In a full implementation, we'd track which reactive objects
  // are accessed during the function execution
  fn();

  // Return cleanup function
  return () => {
    // Cleanup logic would go here
  };
}
