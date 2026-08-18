/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Reproduction for DISC-2026-07-22-004 / FRAME-WA-004 (found during SHELL-TABS-003): a changed
// key on a parent wrapper alone does not force a remount of an unkeyed child inside it --
// dom-creation.ts's "aggressive instance matching" fallback (createDOMNode, ~L238-288) walks the
// live DOM upward from a search root and reuses ANY existing component instance whose constructor
// matches the new vnode's type, when neither side has a key. A wrapper's key changing produces a
// genuinely new wrapper DOM node, but the unkeyed child inside it is still found by the type-only
// search and reused, so its mounted()/initialize() never re-fire.
//
// Framework-owned (Article 16): reproduced with framework primitives alone (renderToDOM + real
// SwissComponents), no application involved. This is the shape alpine-shell's Shell.uix works
// around by additionally stamping the key onto the inner content vnode, not just the wrapper.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("aggressive instance search vs a changed parent key (DISC-2026-07-22-004)", () => {
  it("remounts an unkeyed child when its keyed wrapper's key changes", async () => {
    const log: string[] = [];

    // Matches every real Alpine module's index.ui/renderPage() shape: no key on the page
    // component itself.
    class FixturePage extends SwissComponent {
      mounted() {
        log.push("Page:mounted");
      }
      initialize() {
        log.push("Page:initialize");
        super.initialize();
      }
      render() {
        return jsx("div", { "data-testid": "page", children: "Page" });
      }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      state = { wrapperKey: "workspace-1" } as { wrapperKey: string };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        // The Shell.uix shape: a static host with a keyed wrapper (reconciled via
        // reconcileChildren's keyed array diffing, like a real parent/children tree) around an
        // unkeyed same-type child.
        return jsx("div", {
          class: "host",
          children: [
            jsx(
              "div",
              {
                class: "shell-content",
                children: [jsx(FixturePage, {})],
              },
              this.state.wrapperKey,
            ),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    const firstWrapper = container.querySelector(".shell-content");
    expect(container.querySelector('[data-testid="page"]')).not.toBeNull();
    expect(log).toEqual(["Page:initialize", "Page:mounted"]);

    // Change the wrapper key — the tab-switch scenario. A genuinely new wrapper is expected.
    host!.state.wrapperKey = "workspace-2";
    await flush();

    const secondWrapper = container.querySelector(".shell-content");
    expect(secondWrapper, "wrapper must still be present").not.toBeNull();
    expect(secondWrapper, "changed key must produce a new wrapper DOM node").not.toBe(firstWrapper);

    // The defect: the unkeyed FixturePage child inside the new wrapper is found by the
    // aggressive type-only search and reused, so initialize()/mounted() never fire a second
    // time despite living under a wrapper whose identity changed.
    expect(
      log,
      "FixturePage must remount (initialize()+mounted() fire again) when its wrapper's key changes",
    ).toEqual(["Page:initialize", "Page:mounted", "Page:initialize", "Page:mounted"]);
  });

  it("still reuses an unkeyed same-type instance when the parent wrapper's key is unchanged (control)", async () => {
    // Generality/absent-case per Article 17: confirms the fix (narrowing the fallback) does not
    // regress the case the fallback legitimately serves — an unkeyed child under a STABLE parent
    // identity, e.g. a prop-only re-render, should still reuse the same instance rather than
    // thrash mount/unmount on every render.
    const log: string[] = [];

    class FixturePage extends SwissComponent {
      mounted() {
        log.push("Page:mounted");
      }
      render() {
        return jsx("div", { "data-testid": "page", children: "Page" });
      }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      state = { wrapperKey: "workspace-1", tick: 0 } as { wrapperKey: string; tick: number };
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("div", {
          class: "host",
          children: [
            jsx(
              "div",
              {
                class: "shell-content",
                children: [jsx(FixturePage, {})],
              },
              this.state.wrapperKey,
            ),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();
    expect(log).toEqual(["Page:mounted"]);

    // Re-render with the SAME wrapper key.
    host!.state.tick = 1;
    await flush();

    expect(
      log,
      "unkeyed child under an UNCHANGED parent key must not remount spuriously",
    ).toEqual(["Page:mounted"]);
  });
});
