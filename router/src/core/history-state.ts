/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * One entry in the router's navigation-history stack.
 *
 * `state` is a generic, serializable slot for whatever a consumer wants restored when the
 * user lands back on this entry (scroll position, form state, a reading position, ...). The
 * router itself never inspects its shape.
 */
export interface HistoryEntry {
  path: string;
  params: Record<string, string>;
  state?: unknown;
}

/**
 * A snapshot of the whole history stack, as handed to/from a {@link HistoryStateAdapter}.
 */
export interface HistorySnapshot {
  entries: HistoryEntry[];
  index: number;
}

/**
 * Pluggable persistence for the router's history stack + per-entry state.
 *
 * The router never hard-codes a storage backend (not `localStorage`, not anything else) --
 * a consumer supplies one of these to persist across reloads/devices/sessions however it
 * likes (server-backed, `sessionStorage`, IndexedDB, in-memory/no-op, ...).
 */
export interface HistoryStateAdapter {
  save(entries: HistoryEntry[], index: number): void | Promise<void>;
  load(): HistorySnapshot | null | Promise<HistorySnapshot | null>;
}

/** Key used inside `window.history.state` to correlate a browser entry with our stack index. */
export const HISTORY_INDEX_KEY = "__swissRouterIndex";

export interface NativeHistoryState {
  [HISTORY_INDEX_KEY]?: number;
}
