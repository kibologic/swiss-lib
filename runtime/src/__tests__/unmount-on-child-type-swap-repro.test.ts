/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Reproduction for DISC-2026-07-21-001 (found during SHELL-TABS-001): when a parent's single
// child is reconciled from one component TYPE to a different component type, the outgoing
// instance's unmounted() lifecycle hook is never invoked. Any listeners/timers/subscriptions the
// outgoing component registered in mounted() leak. In the shell this is a tab switch: the content
// slot swaps PageA for PageB and PageA is never told it was unmounted.
//
// Framework-owned (Article 16): reproduced with framework primitives alone (renderToDOM + two
// SwissComponents), no application involved.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); } };

describe("unmounted() on single-child component type swap (DISC-2026-07-21-001)", () => {
  it("fires the outgoing component's unmounted() when the child swaps to a different type", async () => {
    const log: string[] = [];

    class PageA extends SwissComponent {
      mounted() { log.push("A:mounted"); }
      unmounted() { log.push("A:unmounted"); }
      render() { return jsx("div", { "data-testid": "a", children: "Page A" }); }
    }
    class PageB extends SwissComponent {
      mounted() { log.push("B:mounted"); }
      unmounted() { log.push("B:unmounted"); }
      render() { return jsx("section", { "data-testid": "b", children: "Page B" }); }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      state = { which: "a" } as { which: string };
      constructor(p: unknown) { super(p as never); host = this; }
      render() {
        const child = this.state.which === "a" ? jsx(PageA, {}) : jsx(PageB, {});
        // Same shape every real module's renderPage produces: a single unkeyed child in a slot.
        return jsx("div", { class: "slot", children: [child] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="a"]')).not.toBeNull();
    expect(log).toContain("A:mounted");

    // Swap the child to a different component type — the tab-switch scenario.
    host!.state.which = "b";
    await flush();

    // Content correctness (this already worked, per the SHELL-TABS-001 reproduction):
    expect(container.querySelector('[data-testid="b"]'), "Page B should be mounted").not.toBeNull();
    expect(container.querySelector('[data-testid="a"]'), "Page A's DOM should be gone").toBeNull();
    expect(log).toContain("B:mounted");

    // The defect: PageA was removed from the DOM but never told. This is the assertion that
    // fails against the unfixed reconciler.
    expect(log, "outgoing PageA must receive unmounted() when swapped out").toContain("A:unmounted");
  });

  it("fires unmounted() when a conditional child is removed entirely (transition to absent)", async () => {
    // Generality: the leak was never specific to type-swaps. A child rendered by `{cond && <X/>}`
    // that transitions to absent is removed from the DOM and must also be unmounted. This is the
    // most common real case (a closed modal, a dismissed panel) and covers the absent/transition
    // path Article 17 requires, not just the happy swap.
    const log: string[] = [];

    class Panel extends SwissComponent {
      mounted() { log.push("Panel:mounted"); }
      unmounted() { log.push("Panel:unmounted"); }
      render() { return jsx("div", { "data-testid": "panel", children: "Panel" }); }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      state = { show: true } as { show: boolean };
      constructor(p: unknown) { super(p as never); host = this; }
      render() {
        return jsx("div", { class: "slot", children: [this.state.show ? jsx(Panel, {}) : null] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();
    expect(container.querySelector('[data-testid="panel"]')).not.toBeNull();
    expect(log).toContain("Panel:mounted");

    host!.state.show = false;
    await flush();

    expect(container.querySelector('[data-testid="panel"]'), "panel DOM should be gone").toBeNull();
    expect(log, "removed conditional child must receive unmounted()").toContain("Panel:unmounted");
  });
});
