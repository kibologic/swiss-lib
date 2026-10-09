/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-UPDATED-HOOK-GUARD: the loop guards in UpdateManager (guardCommitUpdatedHook for the
// reactive commit path, the performUpdate render gate) only reset after a >1s GAP, so a
// component that stays active at a perfectly sustainable rate was reported as "60/s" and,
// for the commit guard, had its `updated` hook skipped for as long as activity continued.
// Time is faked via performance.now; there are no real sleeps.

import "reflect-metadata";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UpdateManager } from "../component/update-manager.js";
import type { SwissComponent } from "../component/component.js";
import { logger } from "../utils/logger.js";

const MAX = 60;
let clock = 0;

class Probe {
  renders = 0;
  _skipNextUpdate = false;
  safeRender(): null {
    this.renders++;
    return null;
  }
  captureError(): void {}
}

function manager(): { um: UpdateManager; probe: Probe } {
  const probe = new Probe();
  return { um: new UpdateManager(probe as unknown as SwissComponent), probe };
}

beforeEach(() => {
  clock = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("guardCommitUpdatedHook (updated-hook loop guard)", () => {
  it("never trips for a component committing every 900ms (70 commits)", () => {
    const { um } = manager();
    const skipped: number[] = [];
    for (let i = 0; i < 70; i++) {
      if (um.guardCommitUpdatedHook()) skipped.push(i);
      clock += 900;
    }
    expect(skipped).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("trips after MAX commits within one second (true loop)", () => {
    const { um } = manager();
    const results: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(um.guardCommitUpdatedHook());
      clock += 5; // 100 commits in 500ms
    }
    expect(results.slice(0, MAX).every((r) => r === false)).toBe(true);
    expect(results.slice(MAX).every((r) => r === true)).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("recovers as soon as the rate drops below MAX per second", () => {
    const { um } = manager();
    for (let i = 0; i < 100; i++) {
      um.guardCommitUpdatedHook();
      clock += 5;
    }
    expect(um.guardCommitUpdatedHook()).toBe(true);
    // Rate drops to 1 commit / 100ms (10/s) while activity continues -- no quiet second.
    let skipped = 0;
    for (let i = 0; i < 40; i++) {
      clock += 100;
      if (um.guardCommitUpdatedHook()) skipped++;
    }
    // Only the first ~second of the slow phase may still be inside the old burst's window.
    expect(skipped).toBeLessThanOrEqual(10);
    clock += 100;
    expect(um.guardCommitUpdatedHook()).toBe(false);
  });
});

describe("performUpdate render gate", () => {
  it("never throttles a component updating every 900ms (70 updates)", () => {
    const { um, probe } = manager();
    for (let i = 0; i < 70; i++) {
      um.performUpdate();
      clock += 900;
    }
    expect(probe.renders).toBe(70);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("throttles 100 updates within one second after MAX, then recovers", () => {
    vi.useFakeTimers();
    const { um, probe } = manager();
    for (let i = 0; i < 100; i++) {
      um.performUpdate();
      clock += 5;
    }
    expect(probe.renders).toBe(MAX);
    expect(logger.warn).toHaveBeenCalled();
    // Deferred retry fires once the window has room again.
    clock += 1000;
    vi.advanceTimersByTime(1100);
    expect(probe.renders).toBe(MAX + 1);
    clock += 900;
    um.performUpdate();
    expect(probe.renders).toBe(MAX + 2);
  });
});
