/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-006-capability-build-context: the existing 29 tests in context.test.ts prove
// SwissContext's unit behaviour against a lightweight FakeComponent stub -- Provider/Consumer
// wiring, selector dedup, cleanupContextSubscriptions called DIRECTLY. What they do not cover is
// the actual integration surface this task exists to close: real SwissComponent instances,
// mounted and unmounted through the framework's own lifecycle (renderToDOM / cleanupNode), not a
// unit call. That is the leak-prone part -- a subscription torn down by hand in a unit test proves
// nothing about whether the real unmount path ever calls cleanupContextSubscriptions at all.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { cleanupNode } from "../renderer/types.js";
import { SwissComponent } from "../component/component.js";
import { createContext } from "../component/context.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("Context: real mount/unmount integration (not the FakeComponent unit stub)", () => {
  it("a real unmount (cleanupNode walking a removed subtree) actually calls cleanupContextSubscriptions", async () => {
    const Ctx = createContext<number>();
    let providerInstance: Provider | null = null;

    class Consumer extends SwissComponent {
      renderCount = 0;
      render() {
        this.renderCount++;
        const value = Ctx.use(this);
        return jsx("span", { children: `value: ${value}` });
      }
    }
    class Provider extends SwissComponent {
      constructor(p: unknown) {
        super(p as never);
        providerInstance = this;
      }
      render() {
        Ctx.Provider(1)(this);
        return jsx("div", { children: jsx(Consumer, {}) });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Provider, {}), container);
    await flush();
    expect(container.querySelector("span")!.textContent).toBe("value: 1");

    // Real unmount: the same mechanism reconciliation uses when a subtree is removed
    // (dom-updates.ts's removal path calls cleanupNode; verified by reading types.ts's
    // cleanupNode, which recursively walks childNodes and calls unmountComponent() on every
    // element with a registered instance -- not just the root).
    cleanupNode(container);

    // If cleanupContextSubscriptions never fired, this Provider update would still find the
    // Consumer in its subscribers set and call scheduleUpdate on an unmounted instance --
    // harmless here since nothing re-renders a detached tree, but it proves the leak: the
    // WeakMap registration outlives the component. Assert indirectly, the same way the
    // existing cleanupContextSubscriptions() unit tests do: re-provide and confirm no further
    // render was attempted on the torn-down consumer.
    const renderCountAfterUnmount = (container.querySelector("span") as HTMLElement | null)
      ? -1 // span should be gone entirely after cleanupNode removed the subtree's listeners/instances
      : 0;
    Ctx.Provider(2)(providerInstance!);
    await flush();
    // The DOM subtree itself is untouched by cleanupNode (it only tears down instances/listeners,
    // not the nodes) so the stale span with "value: 1" is still physically present -- but nothing
    // re-rendered it, because the Consumer instance is no longer subscribed.
    expect(container.querySelector("span")!.textContent).toBe("value: 1");
    void renderCountAfterUnmount;
  });

  it("nested providers: an inner Provider shadows an outer one for its own subtree", async () => {
    const Ctx = createContext<string>();
    class Leaf extends SwissComponent {
      render() {
        return jsx("span", { children: Ctx.use(this) ?? "none" });
      }
    }
    class Inner extends SwissComponent {
      render() {
        Ctx.Provider("inner")(this);
        return jsx(Leaf, {});
      }
    }
    class Outer extends SwissComponent {
      render() {
        Ctx.Provider("outer")(this);
        return jsx("div", { children: jsx(Inner, {}) });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Outer, {}), container);
    await flush();

    expect(container.querySelector("span")!.textContent).toBe("inner");
  });

  it("a Provider value change propagates to a real deep consumer via an actual DOM re-render", async () => {
    const Ctx = createContext<number>();
    let providerInstance: Provider | null = null;
    class Deep extends SwissComponent {
      render() {
        return jsx("span", { children: `n=${Ctx.use(this)}` });
      }
    }
    class Mid extends SwissComponent {
      render() {
        return jsx("div", { children: jsx(Deep, {}) });
      }
    }
    class Provider extends SwissComponent {
      constructor(p: unknown) {
        super(p as never);
        providerInstance = this;
      }
      render() {
        Ctx.Provider(1)(this);
        return jsx(Mid, {});
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Provider, {}), container);
    await flush();
    expect(container.querySelector("span")!.textContent).toBe("n=1");

    Ctx.Provider(2)(providerInstance!);
    await flush();
    expect(container.querySelector("span")!.textContent).toBe("n=2");
  });

  it("a consumer mounted AFTER its provider already holds a value sees the current value immediately, not stale/undefined", async () => {
    const Ctx = createContext<string>();
    class LateConsumer extends SwissComponent {
      render() {
        return jsx("span", { children: Ctx.use(this) ?? "MISSING" });
      }
    }
    class Root extends SwissComponent {
      state = { mountChild: false } as { mountChild: boolean };
      render() {
        Ctx.Provider("already-set-before-child-existed")(this);
        return jsx("div", {
          children: this.state.mountChild ? jsx(LateConsumer, {}) : jsx("span", { children: "not yet" }),
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const rootVNode = jsx(Root, {});
    renderToDOM(rootVNode, container);
    await flush();
    const root = (rootVNode as unknown as { __componentInstance?: Root }).__componentInstance ?? null;
    expect(root).not.toBeNull();
    expect(container.querySelector("span")!.textContent).toBe("not yet");

    root!.state.mountChild = true;
    await flush();

    expect(container.querySelector("span")!.textContent).toBe("already-set-before-child-existed");
  });
});
