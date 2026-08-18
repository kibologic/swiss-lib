/** @vitest-environment jsdom */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// ASYNC-001: async components + <Suspense> boundary (Article 17 -- feature ships with tests
// demonstrating RED before GREEN). Covers: pending->resolved fallback swap, error routing to the
// nearest ErrorBoundary (not swallowed by Suspense), nested Suspense independence, and reactive
// refetch.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { ErrorBoundary } from "../component/error-boundary.js";
import { Suspense } from "../component/suspense.js";
import { resource } from "../reactivity/resource.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("async components + Suspense", () => {
  it("renders fallback while pending, swaps to real content once the resource resolves", async () => {
    const d = deferred<string>();
    const user = resource(() => d.promise);

    class Profile extends SwissComponent {
      render() {
        return jsx("div", { class: "profile", children: user.data });
      }
    }
    class App extends SwissComponent {
      render() {
        return jsx(Suspense, {
          fallback: jsx("div", { class: "loading", children: "Loading..." }),
          children: jsx(Profile, {}),
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();

    expect(container.querySelector(".loading")?.textContent).toBe("Loading...");
    expect(container.querySelector(".profile")).toBeNull();

    d.resolve("Ada Lovelace");
    await flush();

    expect(container.querySelector(".loading")).toBeNull();
    expect(container.querySelector(".profile")?.textContent).toBe("Ada Lovelace");
  });

  it("routes a resource error to the nearest ErrorBoundary, not to Suspense's fallback", async () => {
    const d = deferred<string>();
    const broken = resource(() => d.promise);

    class Broken extends SwissComponent {
      render() {
        return jsx("div", { class: "profile", children: broken.data });
      }
    }
    class App extends SwissComponent {
      render() {
        return jsx(ErrorBoundary, {
          fallback: (err: unknown) => jsx("div", { class: "boundary-error", children: String((err as Error).message ?? err) }),
          children: jsx(Suspense, {
            fallback: jsx("div", { class: "loading", children: "Loading..." }),
            children: jsx(Broken, {}),
          }),
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();
    expect(container.querySelector(".loading")?.textContent).toBe("Loading...");

    d.reject(new Error("network down"));
    await flush();

    expect(container.querySelector(".boundary-error")?.textContent).toBe("network down");
    expect(container.querySelector(".loading")).toBeNull();
  });

  it("supports nested Suspense: inner boundary resolves independently of the outer one", async () => {
    const outerD = deferred<string>();
    const innerD = deferred<string>();
    const outerRes = resource(() => outerD.promise);
    const innerRes = resource(() => innerD.promise);

    class Inner extends SwissComponent {
      render() {
        return jsx("div", { class: "inner", children: innerRes.data });
      }
    }
    class Outer extends SwissComponent {
      render() {
        return jsx("div", { class: "outer-wrap", children: [
          jsx("span", { class: "outer-value", children: outerRes.data }),
          jsx(Suspense, {
            fallback: jsx("div", { class: "inner-loading", children: "Inner loading..." }),
            children: jsx(Inner, {}),
          }),
        ] });
      }
    }
    class App extends SwissComponent {
      render() {
        return jsx(Suspense, {
          fallback: jsx("div", { class: "outer-loading", children: "Outer loading..." }),
          children: jsx(Outer, {}),
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();
    // Outer resource is still pending, so the outer Suspense shows its fallback -- the inner
    // tree (and its own Suspense) hasn't even mounted yet.
    expect(container.querySelector(".outer-loading")?.textContent).toBe("Outer loading...");

    outerD.resolve("outer-ready");
    await flush();
    // Outer resolved: outer content now mounts, which mounts Inner, which suspends on its own
    // still-pending resource -- the inner Suspense (not the outer) shows its fallback.
    expect(container.querySelector(".outer-loading")).toBeNull();
    expect(container.querySelector(".outer-value")?.textContent).toBe("outer-ready");
    expect(container.querySelector(".inner-loading")?.textContent).toBe("Inner loading...");

    innerD.resolve("inner-ready");
    await flush();
    expect(container.querySelector(".inner-loading")).toBeNull();
    expect(container.querySelector(".inner")?.textContent).toBe("inner-ready");
  });

  it("refetch() re-suspends readers and updates reactively with the new value", async () => {
    let d = deferred<number>();
    const count = resource(() => d.promise);

    class Counter extends SwissComponent {
      render() {
        return jsx("div", { class: "count", children: String(count.data) });
      }
    }
    class App extends SwissComponent {
      render() {
        return jsx(Suspense, {
          fallback: jsx("div", { class: "loading", children: "Loading..." }),
          children: jsx(Counter, {}),
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();
    d.resolve(1);
    await flush();
    expect(container.querySelector(".count")?.textContent).toBe("1");

    d = deferred<number>();
    void count.refetch();
    await flush();
    expect(container.querySelector(".loading")?.textContent).toBe("Loading...");

    d.resolve(2);
    await flush();
    expect(container.querySelector(".count")?.textContent).toBe("2");
  });
});
