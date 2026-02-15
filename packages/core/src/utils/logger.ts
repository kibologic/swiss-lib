/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Swiss debug logger: category-based, runtime flags, __DEV__ guard.
 * Production: all category logs are no-ops. Errors/warnings always on.
 * Development: flags from window.__SWISS_DEBUG__ (or setDebugFlags). Default: all off.
 */

// Runtime constant (no build-time replace for tsc; Swite/prod build can define __DEV__: false later)
const __DEV__ =
  typeof process !== "undefined" &&
  process.env &&
  process.env.NODE_ENV !== "production";

export interface DebugFlags {
  DOM: boolean;
  LIFECYCLE: boolean;
  UPDATES: boolean;
  REACTIVITY: boolean;
  EVENTS: boolean;
  RECONCILE: boolean;
  PERF: boolean;
  ALL: boolean;
}

const DEFAULT_FLAGS: DebugFlags = {
  DOM: false,
  LIFECYCLE: false,
  UPDATES: false,
  REACTIVITY: false,
  EVENTS: false,
  RECONCILE: false,
  PERF: false,
  ALL: false,
};

declare global {
  interface Window {
    __SWISS_DEBUG__?: Partial<DebugFlags> | boolean;
  }
}

function getGlobalFlags(): DebugFlags {
  if (!__DEV__) return { ...DEFAULT_FLAGS };

  const g =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { __SWISS_DEBUG__?: Partial<DebugFlags> | boolean })
      : undefined;
  const userFlags = (typeof window !== "undefined" ? window.__SWISS_DEBUG__ : undefined) ?? g?.__SWISS_DEBUG__;

  if (userFlags === true) {
    return Object.keys(DEFAULT_FLAGS).reduce(
      (acc, key) => {
        acc[key as keyof DebugFlags] = true;
        return acc;
      },
      {} as DebugFlags,
    );
  }
  if (typeof userFlags === "object" && userFlags !== null) {
    return { ...DEFAULT_FLAGS, ...userFlags };
  }
  return { ...DEFAULT_FLAGS };
}

function flagsOn(flags: DebugFlags, category: keyof DebugFlags): boolean {
  return flags.ALL || flags[category];
}

class LoggerImpl {
  dom(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "DOM")) {
      console.log(`[DOM] ${message}`, ...args);
    }
  }

  lifecycle(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "LIFECYCLE")) {
      console.log(`[Lifecycle] ${message}`, ...args);
    }
  }

  updates(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "UPDATES")) {
      console.log(`[Updates] ${message}`, ...args);
    }
  }

  reactivity(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "REACTIVITY")) {
      console.log(`[Reactivity] ${message}`, ...args);
    }
  }

  events(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "EVENTS")) {
      console.log(`[Events] ${message}`, ...args);
    }
  }

  reconcile(message: string, ...args: unknown[]): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "RECONCILE")) {
      console.log(`[Reconcile] ${message}`, ...args);
    }
  }

  perf(message: string, durationMs?: number): void {
    if (__DEV__ && flagsOn(getGlobalFlags(), "PERF")) {
      const timing = durationMs !== undefined ? ` (${durationMs.toFixed(2)}ms)` : "";
      console.log(`[Perf] ${message}${timing}`);
    }
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[Swiss] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[Swiss] ${message}`, ...args);
  }

  getFlags(): DebugFlags {
    return getGlobalFlags();
  }
}

export const logger = new LoggerImpl();

/**
 * Set debug flags at runtime (e.g. from tests or tooling).
 * Merges with existing window.__SWISS_DEBUG__.
 */
export function setDebugFlags(flags: Partial<DebugFlags> | boolean): void {
  if (typeof globalThis === "undefined") return;
  const g = globalThis as unknown as { __SWISS_DEBUG__?: Partial<DebugFlags> | boolean };
  if (flags === true) {
    g.__SWISS_DEBUG__ = true;
    return;
  }
  const current = typeof g.__SWISS_DEBUG__ === "object" && g.__SWISS_DEBUG__ != null ? g.__SWISS_DEBUG__ : {};
  g.__SWISS_DEBUG__ = { ...current, ...flags };
}

/**
 * Performance timer; only calls logger.perf when PERF (or ALL) is on.
 */
export class PerfTimer {
  private start: number;
  private label: string;
  private readonly logPerf: boolean;

  constructor(label: string) {
    this.label = label;
    this.start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    this.logPerf = __DEV__ && flagsOn(getGlobalFlags(), "PERF");
  }

  end(): number {
    const duration = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - this.start;
    if (this.logPerf) logger.perf(this.label, duration);
    return duration;
  }
}
