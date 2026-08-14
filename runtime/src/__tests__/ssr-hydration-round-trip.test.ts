/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
//
// FRAME-006-capability-build-router-ssr: the real SSR round-trip test the task requires --
// renderToString output re-hydrated, asserting no re-creation in the matching case and
// documenting what actually happens in the non-matching case.
//
// This intentionally exercises the RUNTIME primitives (renderToString / hydrate) directly
// rather than router's thin SSR wrappers (ServerRenderer / router/src/ssr/hydration.ts),
// because that is where the identity-sensitive mechanics actually live -- router's wrapper
// is ~40 lines of data-merging around @swissjs/core's own hydrate(). See router/tests/ssr.test.ts
// for the router-level contract test (real component through renderToString, no DOM needed).
//
// Per this task's own never_touch: hydration matches server HTML to client vnodes BY DOM
// POSITION (index-derived), not by a stable key, because FRAME-001 (compile-time stable
// identity) has not landed. Do not read a green "happy path" test here as proof hydration is
// correct in general -- the mismatch test below demonstrates the gap concretely, and it is
// filed against FRAME-001 rather than patched around, per this task's own instructions.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToString } from "../renderer/renderer.js";
import { hydrate } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("SSR round trip: renderToString -> hydrate", () => {
  it("reuses the existing DOM node and restores interactivity when server and client agree", async () => {
    class Counter extends SwissComponent {
      state = { count: (this.props as { start?: number }).start ?? 0 } as { count: number };
      private onIncrement = () => {
        this.state.count += 1;
      };
      render() {
        return jsx("button", {
          class: "counter",
          onClick: this.onIncrement,
          children: `count: ${this.state.count}`,
        });
      }
    }

    // Server: render to a string, exactly as ServerRenderer.render() does internally.
    const html = renderToString(jsx(Counter, { start: 3 }));
    expect(html).toBe('<button class="counter">count: 3</button>');

    // Client: server HTML lands in the DOM before any JS runs.
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const serverButton = container.querySelector("button");
    expect(serverButton).not.toBeNull();
    expect(serverButton!.textContent).toBe("count: 3");

    // Hydrate: attach behaviour to the existing DOM rather than recreating it.
    hydrate(jsx(Counter, { start: 3 }), container);
    await flush();

    const hydratedButton = container.querySelector("button");
    // NO RE-CREATION: same DOM node, not a replacement.
    expect(hydratedButton).toBe(serverButton);

    // Interactivity restored: the click handler that renderToString could not serialize
    // (renderToString explicitly skips "on*" props) is now live.
    hydratedButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(container.querySelector("button")!.textContent).toBe("count: 4");
  });

  it("throws a DiffingError (caught, full re-render fallback) on a genuine tag mismatch", async () => {
    class AsSpan extends SwissComponent {
      render() {
        return jsx("span", { children: "server rendered this as a span" });
      }
    }
    class AsButton extends SwissComponent {
      render() {
        return jsx("button", { children: "client thinks it should be a button" });
      }
    }

    const html = renderToString(jsx(AsSpan, {}));
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const originalSpan = container.querySelector("span");
    expect(originalSpan).not.toBeNull();

    // Client vnode disagrees with what the server actually sent -- e.g. a conditional
    // branch resolved differently between server and first client render. hydrate()'s
    // top-level try/catch (runtime/src/renderer/hydration.ts) recovers by discarding
    // the server-rendered subtree and doing a full client render in its place.
    hydrate(jsx(AsButton, {}), container);
    await flush();

    // NOT reused: the mismatch path is destructive, not a partial patch.
    expect(container.querySelector("span")).toBeNull();
    const rebuilt = container.querySelector("button");
    expect(rebuilt).not.toBeNull();
    expect(rebuilt).not.toBe(originalSpan);
    expect(rebuilt!.textContent).toBe("client thinks it should be a button");
  });

  it("documents the FRAME-001 gap: index-derived identity lets a stale SSR attribute survive a list-position shift", async () => {
    // This is NOT a bug fix -- it is a recorded, reproducible characterisation of the exact
    // risk this task's EXPERIMENTAL header names: "hydration matches server-rendered HTML to
    // client vnodes by node identity, which today is runtime-index-derived... a real
    // hydration mismatch risk." FRAME-006's own never_touch forbids claiming this is correct
    // and forbids patching around it here; the fix is FRAME-001 (stable compile-time keys).
    interface Item { id: number; featured: boolean; label: string }
    class ItemList extends SwissComponent {
      render() {
        const items = (this.props as { items: Item[] }).items;
        return jsx("div", {
          children: items.map((it) =>
            jsx("button", {
              // Conditionally spread, not `data-featured: it.featured ? "true" : false` --
              // an unfeatured item's vnode carries NO "data-featured" key at all, the same
              // way a real conditional-attribute component is usually written. That
              // absence is exactly what makes the leak below possible: reconcileProps only
              // walks keys present in oldProps or newProps (props-updates.ts), so a key
              // that's simply not mentioned by the new vnode is never a candidate for
              // removal, regardless of what the live DOM actually carries.
              ...(it.featured ? { "data-featured": "true" } : {}),
              children: it.label,
            }),
          ),
        });
      }
    }

    // Server render: two items, the FIRST one featured.
    const serverItems: Item[] = [
      { id: 1, featured: true, label: "A" },
      { id: 2, featured: false, label: "B" },
    ];
    const html = renderToString(jsx(ItemList, { items: serverItems }));
    expect(html).toBe(
      '<div><button data-featured="true">A</button><button>B</button></div>',
    );

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // Client's first render disagrees with the server: item A (id 1) is gone -- e.g. a
    // feature flag or auth check resolved differently between server and client. This is
    // a real, not contrived, class of divergence: SSR and the first client render do not
    // share request context by default.
    const clientItems: Item[] = [{ id: 2, featured: false, label: "B" }];
    hydrate(jsx(ItemList, { items: clientItems }), container);
    await flush();

    const buttons = container.querySelectorAll("button");
    // No crash, no DiffingError -- tag names still match at every position, so hydration
    // proceeds silently. The single remaining DOM node is the position-0 node hydration
    // never re-created (same identity risk as the reuse test above -- this is not a
    // separate mechanism, just the same one under different data).
    expect(buttons.length).toBe(1);
    // Text WAS corrected (child text reconciliation runs): the node now reads "B", not "A".
    expect(buttons[0].textContent).toBe("B");
    // But the SSR-rendered "data-featured" attribute was never scheduled for removal --
    // hydrateElementNode calls reconcileProps(domNode, {}, vnode.props) with an EMPTY
    // oldProps every time (router/../runtime hydration.ts), so it only ever ADDS props
    // from the client vnode; it has no record of what the live DOM actually carries and so
    // cannot remove anything the server rendered that the client's vnode doesn't repeat.
    // Item B's vnode never asked for data-featured to be set, but it also never gets
    // cleared: item A's "true" survives, attached to what the page now presents as item B.
    expect(buttons[0].getAttribute("data-featured")).toBe("true");
  });
});
