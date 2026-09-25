/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * Drains the real SwissJS update scheduler.
 *
 * `UpdateManager.scheduleUpdate()` (runtime/src/component/update-manager.ts) schedules
 * re-renders via `queueMicrotask` for root/top-level components, and runs synchronously
 * for child components. There is no test-mode scheduler swap here — this helper just
 * gives the real microtask queue (and, for anything chained through a real Promise/
 * setTimeout inside app code, the macrotask queue) enough turns to settle, exactly as
 * the framework already recommends internally (see runtime's own
 * ssr-hydration-round-trip.test.ts `flush()` helper, which this mirrors).
 *
 * Multiple microtask/macrotask turns are needed because a single signal write can
 * cascade: scheduleUpdate -> microtask -> performUpdate -> child prop update ->
 * another scheduleUpdate. Draining a fixed number of turns catches steady-state
 * cascades without hanging on a runaway one (the runtime's own throttle guards that).
 */
export async function flushUpdates(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
