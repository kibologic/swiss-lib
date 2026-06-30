/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { SwissComponent } from "./component.js";
import type { VNode } from "../vdom/vdom.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwissContextObject<T> {
  readonly Provider: (value: T) => (component: SwissComponent) => SwissComponent;
  readonly Consumer: <S = T>(
    select?: (value: T | undefined) => S,
    equals?: (a: S, b: S) => boolean,
  ) => (component: SwissComponent) => S | T | undefined;
  readonly provide: (
    value: T,
    children: VNode | VNode[] | null | undefined,
    component: SwissComponent,
  ) => VNode | VNode[] | null | undefined;
  readonly ProviderComponent: (
    props: { value: T; children?: VNode | VNode[] | null },
    component: SwissComponent,
  ) => VNode | VNode[] | null | undefined;
  readonly use: (component: SwissComponent) => T | undefined;
}

// ─── Internal cleanup registry ───────────────────────────────────────────────

const __ctxRegistrations: WeakMap<SwissComponent, Set<() => void>> = new WeakMap();

/**
 * Unsubscribes a component from all context subscriptions it holds.
 * Called automatically during component unmount.
 * @internal
 */
export function cleanupContextSubscriptions(component: SwissComponent): void {
  const fns = __ctxRegistrations.get(component);
  if (!fns) return;
  fns.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
  fns.clear();
  __ctxRegistrations.delete(component);
}

// ─── SwissContext factory ─────────────────────────────────────────────────────

export const SwissContext = {
  create: <T>(defaultValue?: T): SwissContextObject<T> => {
    const key = Symbol();

    const subscribeEnabled = (() => {
      const env =
        typeof process !== "undefined" && process.env
          ? process.env.SWISS_CONTEXT_SUBSCRIBE
          : undefined;
      if (env === "0") return false;
      if (env === "1") return true;
      const globalFlag =
        typeof globalThis !== "undefined"
          ? (globalThis as unknown as { __SWISS_CONTEXT_SUBSCRIBE__?: boolean })
              .__SWISS_CONTEXT_SUBSCRIBE__
          : undefined;
      if (globalFlag === false) return false;
      if (globalFlag === true) return true;
      const winFlag =
        typeof window !== "undefined"
          ? (window as unknown as { __SWISS_CONTEXT_SUBSCRIBE__?: boolean })
              .__SWISS_CONTEXT_SUBSCRIBE__
          : undefined;
      if (winFlag === false) return false;
      if (winFlag === true) return true;
      return true;
    })();

    let version = 0;
    const subscribers = new Set<SwissComponent>();
    const selections = new Map<SwissComponent, { sel: unknown; ver: number }>();
    const selectors = new WeakMap<
      SwissComponent,
      Map<symbol, {
        selector?: (v: T | undefined) => unknown;
        equals?: (a: unknown, b: unknown) => boolean;
      }>
    >();
    let warnedMissingProvider = false;

    const Provider = (value: T) => (component: SwissComponent): SwissComponent => {
      component.provideContext(key, value);
      if (subscribeEnabled) {
        version++;
        if (version > 1) {
          subscribers.forEach((sub: SwissComponent) => {
            try {
              const selInfo = selections.get(sub);
              if (!selInfo) {
                if (typeof sub.scheduleUpdate === "function") sub.scheduleUpdate();
                return;
              }
              const entry = selectors.get(sub)?.get(key) ?? {};
              const selector = entry.selector as ((v: T | undefined) => unknown) | undefined;
              const equals = entry.equals as ((a: unknown, b: unknown) => boolean) | undefined;
              const next = Consumer(selector, equals)(sub) as unknown;
              const prev = selInfo.sel;
              const isEqual = typeof equals === "function" ? !!equals(prev, next) : prev === next;
              if (!isEqual) {
                selections.set(sub, { sel: next, ver: version });
                if (typeof sub.scheduleUpdate === "function") sub.scheduleUpdate();
              } else {
                selections.set(sub, { sel: prev, ver: version });
              }
            } catch { /* best-effort */ }
          });
        }
      }
      return component;
    };

    const Consumer = <S = T>(
      select?: (v: T | undefined) => S,
      equals?: (a: S, b: S) => boolean,
    ) => (component: SwissComponent): S | T | undefined => {
      const provided = component.useContext(key) as T | undefined;
      let value: S | T | undefined = provided as unknown as S | T | undefined;
      if (typeof select === "function") {
        value = select(provided) as unknown as S | T | undefined;
      }

      const isMissing = typeof provided === "undefined";
      if (isMissing && typeof defaultValue !== "undefined") {
        const inDev =
          typeof process !== "undefined" &&
          process.env &&
          process.env.NODE_ENV !== "production";
        if (inDev && !warnedMissingProvider) {
          console.warn("[SwissContext] Consumer resolved to default — no Provider found for this key.");
          warnedMissingProvider = true;
        }
        value = typeof select === "function"
          ? (select(defaultValue) as unknown as S | T | undefined)
          : (defaultValue as unknown as S | T | undefined);
      }

      if (subscribeEnabled) {
        subscribers.add(component);
        if (!selectors.get(component)) {
          selectors.set(component, new Map());
        }
        selectors.get(component)!.set(key, {
          selector: select as ((v: T | undefined) => unknown) | undefined,
          equals: equals as ((a: unknown, b: unknown) => boolean) | undefined,
        });
        const prev = selections.get(component);
        if (!prev || prev.ver !== version) {
          selections.set(component, { sel: value as unknown, ver: version });
        }

        let set = __ctxRegistrations.get(component);
        if (!set) {
          set = new Set();
          __ctxRegistrations.set(component, set);
        }
        const unsubscribe = () => {
          subscribers.delete(component);
          const m = selectors.get(component);
          if (m) {
            m.delete(key);
            if (m.size === 0) selectors.delete(component);
          }
          selections.delete(component);
        };
        set.add(unsubscribe);
      }

      return value;
    };

    const provide = (
      value: T,
      children: VNode | VNode[] | null | undefined,
      component: SwissComponent,
    ): VNode | VNode[] | null | undefined => {
      component.provideContext(key, value);
      return children;
    };

    const ProviderComponent = (
      props: { value: T; children?: VNode | VNode[] | null },
      component: SwissComponent,
    ): VNode | VNode[] | null | undefined => {
      component.provideContext(key, props.value);
      return props.children ?? null;
    };

    const use = (component: SwissComponent): T | undefined =>
      Consumer()(component) as T | undefined;

    return { Provider, Consumer, provide, ProviderComponent, use };
  },
};

// ─── Standalone API ───────────────────────────────────────────────────────────

/**
 * Create a typed context that can be provided and consumed anywhere in the
 * component tree via the nearest ancestor Provider.
 */
export function createContext<T>(defaultValue?: T): SwissContextObject<T> {
  return SwissContext.create<T>(defaultValue);
}

/**
 * Read the current context value from the nearest ancestor Provider.
 * Returns `defaultValue` (or `undefined`) when no Provider is found above
 * `component` in the tree.
 */
export function useContext<T>(
  ctx: SwissContextObject<T>,
  component: SwissComponent,
): T | undefined {
  return ctx.use(component);
}
