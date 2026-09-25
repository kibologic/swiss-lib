/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ComponentLike } from "./router.js";

/**
 * A lazily-loaded route component (ROUTER-LAZY-ROUTES). Created with {@link lazy}, e.g.
 * `lazy(() => import('./Settings.ui').then((m) => m.Settings))`.
 *
 * A distinct wrapper, rather than accepting a bare `() => Promise<ComponentLike>`
 * directly as `Route.component`, is deliberate: a plain function is *already* a valid
 * `ComponentLike` in this framework (a functional component is `(props) => VNode`), so a
 * raw-function union would be ambiguous to tell apart at runtime without fragile
 * heuristics (arity, `AsyncFunction` checks, ...). The wrapper makes "this is a lazy
 * loader" an explicit, checkable fact instead.
 */
export interface LazyComponent {
  readonly __swissLazy: true;
  load(): Promise<ComponentLike>;
}

/** Wrap a dynamic-import loader as a lazy route component. The import runs at most once. */
export function lazy(loader: () => Promise<ComponentLike>): LazyComponent {
  let inflight: Promise<ComponentLike> | null = null;
  return {
    __swissLazy: true,
    load(): Promise<ComponentLike> {
      if (!inflight) inflight = loader();
      return inflight;
    },
  };
}

export function isLazyComponent(
  value: ComponentLike | LazyComponent,
): value is LazyComponent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __swissLazy?: unknown }).__swissLazy === true
  );
}

export type LazyState =
  | { status: "pending" }
  | { status: "resolved"; component: ComponentLike }
  | { status: "rejected"; error: unknown };

const lazyCache = new WeakMap<LazyComponent, LazyState>();

/**
 * Starts loading a lazy component if it hasn't started already (idempotent -- the
 * underlying loader still runs at most once, per {@link lazy}), and returns whatever is
 * currently cached, synchronously. Never throws: a rejected import is recorded as
 * `{ status: 'rejected', error }`, not propagated.
 */
export function ensureLazyLoadStarted(component: LazyComponent): LazyState {
  const existing = lazyCache.get(component);
  if (existing) return existing;

  const pending: LazyState = { status: "pending" };
  lazyCache.set(component, pending);

  // Single two-argument .then(), not .then().catch() -- the latter resolves the
  // rejection-handling branch one extra microtask tick later than a direct `await` of the
  // same promise (the rejection has to pass through the first .then()'s implicit
  // passthrough before the chained .catch() sees it), which raced against preloadLazy()'s
  // own `await component.load()` below and read the cache before this write landed.
  component.load().then(
    (resolved) => {
      lazyCache.set(component, { status: "resolved", component: resolved });
    },
    (error: unknown) => {
      lazyCache.set(component, { status: "rejected", error });
    },
  );

  return pending;
}

/**
 * Preload a lazy route component ahead of rendering it (e.g. before navigating there), so
 * `Outlet`'s next render sees it already resolved instead of a pending placeholder. Never
 * rejects -- inspect the returned {@link LazyState}'s `status` instead.
 */
export async function preloadLazy(component: LazyComponent): Promise<LazyState> {
  ensureLazyLoadStarted(component);
  try {
    await component.load();
  } catch {
    // Already recorded in lazyCache by ensureLazyLoadStarted()'s own .catch(); swallowed
    // here too so preloadLazy() itself never rejects.
  }
  return lazyCache.get(component) ?? { status: "pending" };
}
