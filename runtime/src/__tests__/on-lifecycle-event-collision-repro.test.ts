/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-on-collision: the ACTUAL root cause of office's PdfViewerPage bug (registry
// finding) -- not a gap in which commit path fires "updated" (PR #134 /
// FRAME-commitvnode-updated-hook, and this branch's own updateComponentNode fix, both
// cover that correctly), but that `this.on('updated', cb)` never reaches the lifecycle
// hook registry AT ALL in a real app.
//
// component.ts declares `SwissComponent.prototype.on` as its own method, delegating to
// `_lifecycle.on()` (the lifecycle-hook registrar for phases like "mounted"/"updated").
// event-system.ts, at MODULE-LEVEL side-effect time, does
// `SwissComponent.prototype.on = function (eventType, ...) {...}` -- a DOM-style
// capture/bubble custom-event emitter (`_eventRegistry`-backed), UNCONDITIONALLY
// overwriting the class's own method, since both attach to the identical property name.
// Whichever module is imported/evaluated last wins outright; there is no merge.
//
// Every prior test in this suite (including PR #134's own commitvnode-updated-hook-repro
// tests, and this branch's own updated-hook-child-component-repro test) imports
// `SwissComponent` from "../component/component.js" DIRECTLY -- bypassing the public
// barrel ("../component/index.js", which is what `@swissjs/core` -- and therefore every
// real app, including office -- actually imports through) and therefore never triggers
// event-system.ts's side effect. Those tests could not have caught this: `on()` behaved
// correctly precisely because the collision never happened in that import graph. This
// test imports from the PUBLIC barrel, matching real consumers, to reproduce it for real.
//
// Live-confirmed in the real app (office, browser devtools): calling
// `instance.on('updated', cb)` -- the exact statement inside PdfViewerPage's `mount {}`
// block -- left `instance._lifecycle.getHooks()` showing only `["mounted"]`, never
// `"updated"`, even though the surrounding statements in the same synchronous function
// ran (including the very next line, an async load call). The callback silently went into
// `_eventRegistry` instead; `executeHookPhase('updated')` only ever reads
// `_lifecycle.hooks` and so never invoked it. No error, no warning.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { SwissComponent } from "../index.js";
import "../component/event-system.js";

describe("FRAME-on-collision: this.on('updated', cb) must reach the lifecycle registry, not the DOM-style event emitter", () => {
  it("registers an 'updated' listener into _lifecycle.hooks, not _eventRegistry, when event-system.ts has also loaded", () => {
    class Widget extends SwissComponent {
      render() {
        return null;
      }
    }
    const widget = new Widget({} as never);

    widget.on("updated", () => {});

    const hookPhases = Object.keys(
      (widget as unknown as { _lifecycle: { getHooks(): Record<string, unknown[]> } })
        ._lifecycle.getHooks(),
    );
    expect(hookPhases).toContain("updated");

    // The DOM-style custom-event registry must NOT have swallowed it instead.
    const eventRegistry = (
      widget as unknown as {
        _eventRegistry: Map<string, { capture: Map<unknown, unknown>; bubble: Map<unknown, unknown> }>;
      }
    )._eventRegistry;
    expect(eventRegistry.has("updated")).toBe(false);
  });

  it("actually invokes an 'updated' callback registered via this.on() when executeHookPhase('updated') runs", async () => {
    let calls = 0;
    class Widget extends SwissComponent {
      render() {
        return null;
      }
    }
    const widget = new Widget({} as never);
    widget.on("updated", () => {
      calls++;
    });

    await widget.executeHookPhase("updated");

    expect(calls).toBe(1);
  });

  it("still delivers real custom (non-lifecycle) events through the DOM-style emitter", () => {
    let received: unknown = null;
    class Widget extends SwissComponent {
      render() {
        return null;
      }
    }
    const widget = new Widget({} as never);
    widget.on("my:custom:event", (event: unknown) => {
      received = (event as { detail: unknown }).detail;
    });

    widget.emit("my:custom:event", { ok: true });

    expect(received).toEqual({ ok: true });
  });
});
