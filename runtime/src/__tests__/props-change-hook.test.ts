/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-PROPS-CHANGE-HOOK: first-class prop-change lifecycle hook.
//
// Background (Article 16, attribution before fixes): a bare method named
// `onUpdate(prevProps)` on a component class is NOT a lifecycle hook in this framework --
// verified by grep across compiler/src and runtime/src (zero references) and empirically by
// parent-driven-prop-push-updated-hook-repro.test.ts. Office had 9 components defining one as
// dead code (PRs #167/#169), each with a real stale-UI symptom, and built an app-side
// workaround (`frontend/app/src/lifecycle/watch-prop.ui`, `watchProp(component, select,
// onChange)`) that diffs the last-seen value against `this.on('updated', ...)`. This test
// suite is the RED half of the fix the operator approved 2026-09-25: a first-class
// `onPropsChange(prevProps, nextProps)` hook, invoked by the framework itself, so the dead-hook
// trap stops being possible to fall into by naming convention alone.
//
// Written to FAIL before the change: `onPropsChange` does not exist as a recognized hook yet.
import "reflect-metadata";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { logger } from "../utils/logger.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("onPropsChange lifecycle hook", () => {
  it("fires on a parent-driven prop change (reused routed component, no remount)", async () => {
    const log: Array<{ prev: { resourceId: string }; next: { resourceId: string } }> = [];

    class RoutedPage extends SwissComponent {
      props!: { resourceId: string };
      onPropsChange(prevProps: { resourceId: string }, nextProps: { resourceId: string }) {
        log.push({ prev: { ...prevProps }, next: { ...nextProps } });
      }
      render() {
        return jsx("div", { "data-testid": "page", children: `resource:${this.props.resourceId}` });
      }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      state = { resourceId: "book-1" } as { resourceId: string };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("div", { children: [jsx(RoutedPage, { resourceId: this.state.resourceId })] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(log.length, "must not fire on mount").toBe(0);

    host!.state.resourceId = "book-2";
    await flush();

    expect(log.length, "a routed page reused with a new prop must fire onPropsChange").toBeGreaterThan(0);
    expect(log[0].prev.resourceId, "must receive the previous props").toBe("book-1");
    expect(log[log.length - 1].next.resourceId).toBe("book-2");
  });

  it("does not fire on mount", async () => {
    const log: unknown[] = [];

    class Widget extends SwissComponent {
      props!: { label: string };
      onPropsChange(prev: unknown, next: unknown) {
        log.push({ prev, next });
      }
      render() {
        return jsx("div", { children: this.props.label });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Widget, { label: "hello" }), container);
    await flush();

    expect(log.length).toBe(0);
  });

  it("does not fire on internal state changes when props are unchanged", async () => {
    const log: unknown[] = [];
    let instance: Counter | null = null;

    class Counter extends SwissComponent {
      props!: { fixed: string };
      state = { count: 0 } as { count: number };
      constructor(p: unknown) {
        super(p as never);
        instance = this;
      }
      onPropsChange(prev: unknown, next: unknown) {
        log.push({ prev, next });
      }
      render() {
        return jsx("div", { "data-testid": "count", children: `${this.props.fixed}:${this.state.count}` });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Counter, { fixed: "x" }), container);
    await flush();

    instance!.state.count = 1;
    await flush();
    instance!.state.count = 2;
    await flush();

    expect(
      container.querySelector('[data-testid="count"]')?.textContent,
      "state re-render must still commit",
    ).toBe("x:2");
    expect(log.length, "must not fire when only internal state changed").toBe(0);
  });

  it("is compatible with the existing 'updated' hook (both fire on a real prop change)", async () => {
    const events: string[] = [];
    let host: Host | null = null;

    class Child extends SwissComponent {
      props!: { value: string };
      mounted() {
        this.on("updated", () => events.push(`updated:${this.props.value}`));
      }
      onPropsChange(prev: { value: string }, next: { value: string }) {
        events.push(`propsChanged:${prev.value}->${next.value}`);
      }
      render() {
        return jsx("div", { children: this.props.value });
      }
    }

    class Host extends SwissComponent {
      state = { value: "a" } as { value: string };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("div", { children: [jsx(Child, { value: this.state.value })] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    host!.state.value = "b";
    await flush();

    expect(events).toContain("propsChanged:a->b");
    expect(events.some((e) => e.startsWith("updated:"))).toBe(true);
  });

  it("fires exactly once per actual prop change, not once per internal commit", async () => {
    const log: string[] = [];
    let host: Host | null = null;

    class Child extends SwissComponent {
      props!: { value: string };
      onPropsChange(_prev: { value: string }, next: { value: string }) {
        log.push(next.value);
      }
      render() {
        return jsx("div", { children: this.props.value });
      }
    }

    class Host extends SwissComponent {
      state = { value: "a" } as { value: string };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("div", { children: [jsx(Child, { value: this.state.value })] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    host!.state.value = "b";
    await flush();

    expect(log, `onPropsChange should fire once for this single prop change, got: ${log.join(",")}`).toEqual([
      "b",
    ]);
  });
});

describe("dead-hook misspelling warning", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns in dev mode when a component defines a bare onUpdate(prevProps) method", async () => {
    class Trap extends SwissComponent {
      props!: { x: number };
      onUpdate(_prevProps: { x: number }) {
        // dead code -- never called by the framework
      }
      render() {
        return jsx("div", { children: String(this.props.x) });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Trap, { x: 1 }), container);
    await flush();

    const warned = warnSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("onUpdate") && call[0].includes("onPropsChange"),
    );
    expect(warned, `expected a dead-hook warning mentioning onUpdate and onPropsChange, got calls: ${JSON.stringify(warnSpy.mock.calls)}`).toBe(true);
  });
});
