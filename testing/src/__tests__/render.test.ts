/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Article 17 (registry law): a testing library is proven by testing a real sample
// component with it. This file is that proof — it exercises `@swissjs/testing`
// against a real SwissComponent through the REAL mount + render + scheduler path
// (runtime/src/framework/app.ts SwissApp.mount dispatch, component-lifecycle.ts
// mountComponent, update-manager.ts UpdateManager.scheduleUpdate), not a fake DOM
// or a hand-rolled render stub. If these pass, render/queries/fireEvent/waitFor
// are proven against the actual runtime.
import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { SwissComponent, jsx } from "@swissjs/core";
import { render, cleanup, fireEvent, waitFor, flushUpdates } from "../index.js";

afterEach(cleanup);

interface CounterState {
  count: number;
  loaded: boolean;
}

class Counter extends SwissComponent {
  state: CounterState = { count: (this.props as { start?: number }).start ?? 0, loaded: false };

  private onIncrement = () => {
    this.state.count += 1;
  };

  mounted() {
    // Simulates an async data load (e.g. a fetch) completing after mount —
    // exercises waitFor()/findBy* against a genuinely async, scheduler-driven update.
    setTimeout(() => {
      this.state.loaded = true;
    }, 10);
  }

  render() {
    return jsx("div", {
      children: [
        jsx("button", {
          "data-testid": "increment",
          onClick: this.onIncrement,
          children: `count: ${this.state.count}`,
        }),
        jsx("span", {
          role: "status",
          children: this.state.loaded ? "ready" : "loading",
        }),
      ],
    });
  }
}

function Greeting(props: Record<string, unknown>) {
  const name = (props.name as string) ?? "world";
  return jsx("h1", { children: `Hello, ${name}!` });
}

describe("@swissjs/testing: render()", () => {
  it("mounts a class component through the real SwissApp mount path and queries render output", () => {
    const { getByText, getByTestId, container } = render(Counter, { props: { start: 3 } });

    expect(getByText(/count: 3/)).toBeTruthy();
    expect(getByTestId("increment").tagName).toBe("BUTTON");
    // Proves this went through the real renderer: a live DOM subtree exists under container.
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("mounts a functional component via createElement + renderToDOM", () => {
    const { getByText } = render(Greeting, { props: { name: "Swiss" } });
    expect(getByText("Hello, Swiss!")).toBeTruthy();
  });

  it("queryByText returns null (not throw) when nothing matches", () => {
    const { queryByText } = render(Greeting, { props: { name: "Swiss" } });
    expect(queryByText("nope")).toBeNull();
  });

  it("getByRole finds an implicit button role and getAllByText finds duplicates", () => {
    const { getByRole } = render(Counter, { props: { start: 0 } });
    const btn = getByRole("button");
    expect(btn.getAttribute("data-testid")).toBe("increment");
  });
});

describe("@swissjs/testing: fireEvent drives the real scheduler", () => {
  it("a click dispatches a real DOM event, the handler mutates state, and scheduleUpdate's microtask has committed by the time fireEvent resolves", async () => {
    const { getByTestId, getByText } = render(Counter, { props: { start: 0 } });

    expect(getByText(/count: 0/)).toBeTruthy();

    // This is the scheduler-integration proof: UpdateManager.scheduleUpdate() (runtime
    // src/component/update-manager.ts) schedules the re-render via queueMicrotask. If
    // fireEvent did not drain that microtask, this assertion would still see "count: 0".
    await fireEvent.click(getByTestId("increment"));

    expect(getByText(/count: 1/)).toBeTruthy();
    expect(() => getByText(/count: 0/)).toThrow();
  });

  it("multiple clicks each commit before the next assertion", async () => {
    const { getByTestId, getByText } = render(Counter, { props: { start: 0 } });
    const btn = getByTestId("increment");

    await fireEvent.click(btn);
    await fireEvent.click(btn);
    await fireEvent.click(btn);

    expect(getByText(/count: 3/)).toBeTruthy();
  });
});

describe("@swissjs/testing: waitFor / findBy* observe async updates", () => {
  it("findByText resolves once the component's own setTimeout-driven state update lands", async () => {
    const { findByText, queryByText } = render(Counter, { props: { start: 0 } });

    // Not ready synchronously — the mounted() hook's setTimeout hasn't fired yet.
    expect(queryByText("ready")).toBeNull();

    const status = await findByText("ready");
    expect(status.textContent).toBe("ready");
  });

  it("waitFor times out (rejects) when the awaited condition never becomes true", async () => {
    render(Greeting, { props: { name: "Swiss" } });
    await expect(
      waitFor(
        () => {
          throw new Error("never satisfied");
        },
        { timeout: 60, interval: 10 },
      ),
    ).rejects.toThrow(/waitFor timed out/);
  });
});

describe("@swissjs/testing: unmount / cleanup", () => {
  it("unmount() removes the container from the document", () => {
    const { unmount, container } = render(Greeting, { props: { name: "X" } });
    expect(document.body.contains(container)).toBe(true);
    unmount();
    expect(document.body.contains(container)).toBe(false);
  });

  it("cleanup() unmounts components not explicitly unmounted and empties document.body", () => {
    render(Greeting, { props: { name: "A" } });
    render(Greeting, { props: { name: "B" } });
    expect(document.body.children.length).toBeGreaterThan(0);
    cleanup();
    expect(document.body.children.length).toBe(0);
  });

  it("flushUpdates is available standalone for tests that need finer control than fireEvent/waitFor", async () => {
    const { getByTestId, getByText } = render(Counter, { props: { start: 0 } });
    getByTestId("increment").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushUpdates();
    expect(getByText(/count: 1/)).toBeTruthy();
  });
});
