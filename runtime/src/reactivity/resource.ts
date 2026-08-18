/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// ASYNC-001: async data primitive for SwissJS, built entirely on the existing Signal/effect
// primitives (reactivity/signals.ts) -- no parallel reactivity system, no bridging code between
// Signal and the reactive proxy (that dual-tracking gap is explicitly out of scope per DOCTRINE).
//
// Design rationale (Article 18 -- reason from SwissJS's own primitives, don't clone another
// framework's API):
//   - `pending`/`error`/`data` are plain `Signal`s. Reading `.value` inside a component render
//     (which runs inside an Effect via commitVNode's signal-driven re-render path,
//     reactivity-setup.ts) already participates in the framework's own dependency tracking --
//     resolving a resource just flips signals, and any component that read them re-renders
//     through the *existing* effect machinery. No new scheduler, no new "suspense context" data
//     structure threaded through the renderer.
//   - Suspending a render is modeled the same way SwissJS already models "stop this render, let
//     an ancestor handle it": ErrorBoundary's captureChildError()/_parent walk (component.ts).
//     A pending resource read via `.data` throws a SuspensionSignal instead of returning a value;
//     Suspense (component/suspense.ts) is the ancestor that catches it, exactly the way
//     ErrorBoundary catches a thrown Error. This reuses the one propagation mechanism the
//     framework already has for "something below me needs to interrupt normal rendering",
//     instead of inventing a second one.
//   - `resource()` does not require component lifecycle to run the fetch -- it starts eagerly
//     (like ComputedSignal starts eagerly), matching the existing eager-Signal convention in this
//     file rather than adding lazy-on-first-read semantics that don't exist anywhere else here.

import { Signal, signal } from "./signals.js";

/**
 * Thrown by Resource#data when the resource is still pending. Caught by <Suspense> boundaries
 * (component/suspense.ts), which walk the component's _parent chain the same way ErrorBoundary
 * walks it for thrown Errors. Never meant to escape past a Suspense boundary -- if it does (no
 * ancestor Suspense), it surfaces as an ordinary uncaught error, which is the correct fallback:
 * a suspending read with no boundary above it is a real bug in the component tree, not a case to
 * paper over silently.
 */
export class SuspensionSignal {
  constructor(public readonly promise: Promise<unknown>) {}
}

export interface ResourceOptions<T> {
  /** Initial value to use before the first fetch resolves. Defaults to undefined. */
  initialValue?: T;
  /** Human-readable name, forwarded to the underlying signals for debugging (mirrors SignalOptions.name). */
  name?: string;
}

export interface ResourceRefetchOptions {
  /** Skip the pending flip (used for background refetches that should not re-suspend consumers). */
  silent?: boolean;
}

/**
 * A reactive async data source. `fetcher` runs immediately and again any time `refetch()` is
 * called. Reading `.data` while pending throws a SuspensionSignal for <Suspense> to catch --
 * read `.pending`/`.error` directly (they never throw) to build custom loading UI without
 * Suspense.
 */
export class Resource<T> {
  private _data: Signal<T | undefined>;
  private _error: Signal<unknown>;
  private _pending: Signal<boolean>;
  private _promise: Promise<unknown> | null = null;
  private _fetcher: () => Promise<T>;
  private _version = 0;

  constructor(fetcher: () => Promise<T>, options: ResourceOptions<T> = {}) {
    this._fetcher = fetcher;
    this._data = signal(options.initialValue, { name: options.name ? `${options.name}:data` : undefined });
    this._error = signal<unknown>(undefined, { name: options.name ? `${options.name}:error` : undefined });
    this._pending = signal(true, { name: options.name ? `${options.name}:pending` : undefined });
    this._load();
  }

  private _load(silent = false): Promise<void> {
    const version = ++this._version;
    if (!silent) {
      this._pending.value = true;
      this._error.value = undefined;
    }
    const promise = this._fetcher();
    this._promise = promise;
    return promise.then(
      (value) => {
        if (version !== this._version) return; // superseded by a later refetch
        this._data.value = value;
        this._error.value = undefined;
        this._pending.value = false;
      },
      (err) => {
        if (version !== this._version) return;
        this._error.value = err;
        this._pending.value = false;
      },
    );
  }

  /** Reactive: true while the current fetch is in flight. Never throws. */
  get pending(): boolean {
    return this._pending.value;
  }

  /** Reactive: the error from the most recent failed fetch, if any. Never throws. */
  get error(): unknown {
    return this._error.value;
  }

  /**
   * Reactive: the resolved value. Throws a SuspensionSignal while pending (for <Suspense> to
   * catch) and re-throws the fetch error while in an error state (for ErrorBoundary to catch --
   * same convention SwissComponent.captureError already uses for render-phase throws).
   */
  get data(): T {
    if (this._pending.value) {
      throw new SuspensionSignal(this._promise ?? Promise.resolve());
    }
    if (this._error.value !== undefined) {
      throw this._error.value;
    }
    return this._data.value as T;
  }

  /** Non-throwing read of the last known value, pending or not (like Signal#peek). */
  peek(): T | undefined {
    return this._data.peek();
  }

  /** Re-run the fetcher. By default this flips `pending` back to true (re-suspends readers of `.data`). */
  refetch(options: ResourceRefetchOptions = {}): Promise<void> {
    return this._load(options.silent ?? false);
  }
}

/**
 * Create a reactive async resource from a fetcher function.
 *
 * @example
 * const user = resource(() => fetch(`/api/users/${id}`).then(r => r.json()));
 * // in render(): user.data (suspends), user.pending, user.error
 */
export function resource<T>(fetcher: () => Promise<T>, options?: ResourceOptions<T>): Resource<T> {
  return new Resource(fetcher, options);
}
