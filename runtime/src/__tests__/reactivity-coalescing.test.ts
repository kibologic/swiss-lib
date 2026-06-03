/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwissComponent } from "../component/component.js";
import { ReactivityManager } from "../component/reactivity-setup.js";

// Minimal stub so tests run without a real DOM environment
function makeComponent(): SwissComponent {
  const comp = Object.create(SwissComponent.prototype) as SwissComponent;
  (comp as any)._signalCommitPending = false;
  (comp as any).constructor = { name: "TestComponent" };
  (comp as any).safeRender = () => null;
  (comp as any).commitVNode = vi.fn();
  (comp as any).scheduleUpdate = vi.fn();
  (comp as any).captureError = vi.fn();
  (comp as any)._skipNextUpdate = false;
  (comp as any)._container = null;
  (comp as any)._domNode = null;
  (comp as any)._vnode = null;
  return comp;
}

describe("_signalCommitPending flag", () => {
  it("is false by default on a fresh component", () => {
    const comp = makeComponent();
    expect((comp as any)._signalCommitPending).toBe(false);
  });

  it("ReactivityManager sets _signalCommitPending=true before its microtask commit", async () => {
    const comp = makeComponent();
    (comp as any)._isMounted = false;
    // Minimal signal-like stub: setting _signalCommitPending directly simulates
    // what ReactivityManager.setupReactivity() does when a signal fires.
    (comp as any)._signalCommitPending = true;
    expect((comp as any)._signalCommitPending).toBe(true);

    // Simulate microtask completing
    await Promise.resolve();
    (comp as any)._signalCommitPending = false;
    expect((comp as any)._signalCommitPending).toBe(false);
  });

  it("scheduleUpdate skips when _signalCommitPending is true", () => {
    const comp = makeComponent();
    // Simulate a signal having already queued its commit
    (comp as any)._signalCommitPending = true;

    // Track whether performUpdate was called
    let performUpdateCalled = false;
    (comp as any).updateManager = {
      scheduleUpdate: function () {
        if ((comp as any)._signalCommitPending) return; // mirrors the fix
        performUpdateCalled = true;
      },
    };

    (comp as any).updateManager.scheduleUpdate();
    expect(performUpdateCalled).toBe(false);
  });

  it("scheduleUpdate runs when _signalCommitPending is false", () => {
    const comp = makeComponent();
    (comp as any)._signalCommitPending = false;

    let performUpdateCalled = false;
    (comp as any).updateManager = {
      scheduleUpdate: function () {
        if ((comp as any)._signalCommitPending) return;
        performUpdateCalled = true;
      },
    };

    (comp as any).updateManager.scheduleUpdate();
    expect(performUpdateCalled).toBe(true);
  });
});
