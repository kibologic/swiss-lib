/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { Signal } from "./signals.js";
import { effect as effectImpl, trackEffect } from "./effect.js";
export type { EffectDisposer } from "./types/index.js";

/**
 * Create a reactive object that notifies listeners when properties change
 */
export function reactive<T extends object>(target: T): T {
  const signals = new Map<PropertyKey, Signal<unknown>>();

  const record = target as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    signals.set(key, new Signal(record[key]));
  }

  const proxy = new Proxy(target, {
    get(obj: T, prop: PropertyKey) {
      if (typeof prop === "symbol" || String(prop).startsWith("__")) {
        return Reflect.get(obj, prop);
      }

      if (!signals.has(prop)) {
        signals.set(prop, new Signal(Reflect.get(obj, prop)));
      }

      const sig = signals.get(prop)!;
      trackEffect(sig);
      return sig.peek();
    },
    set(obj: T, prop: PropertyKey, value: unknown) {
      if (typeof prop === "symbol" || String(prop).startsWith("__")) {
        return Reflect.set(obj, prop, value);
      }

      if (!signals.has(prop)) {
        signals.set(prop, new Signal(value));
      } else {
        signals.get(prop)!.value = value;
      }

      return Reflect.set(obj, prop, value);
    },
    has(obj: T, prop: PropertyKey) {
      return prop in obj || signals.has(prop);
    },
  });

  if (!Reflect.has(proxy, "__reactive")) {
    Object.defineProperty(proxy, "__reactive", {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return proxy;
}

/**
 * Watch for changes on a specific property
 */
export function watch<T extends object>(
  obj: T,
  property: keyof T,
  callback: (newValue: unknown, oldValue: unknown) => void,
): () => void {
  let currentValue = obj[property];
  return effectImpl(() => {
    const nextValue = obj[property];
    if (nextValue !== currentValue) {
      const prev = currentValue;
      currentValue = nextValue;
      callback(nextValue, prev);
    }
  });
}

/**
 * Watch for any changes on the object
 */
export function watchAll<T extends object>(
  obj: T,
  callback: () => void,
): () => void {
  return effectImpl(() => {
    void obj;
    callback();
  });
}

export { signal, computed } from "./signals.js";
export {
  effect,
  effect as reactiveEffect,
  untrack,
  onCleanup,
} from "./effect.js";
