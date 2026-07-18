/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// Regression test for the "stuck loading skeleton" bug (registry/fable/loading-state/):
// reconcileChildren's dual-commit staleness guard bails on a genuine child-count mismatch and
// assumes some OTHER, already-in-flight commit will re-touch the same parent shortly after --
// but if no other commit ever does (the two racing passes diverge upstream of this exact
// position), the bailed pass's change is lost forever, not merely deferred. Live-verified on
// business.alpine's InventoryItemsPage: a DataTable child's `loading` prop was recomputed
// correctly by every render() call, but the live instance's `.props.loading` never updated --
// the skeleton stayed on screen indefinitely.
//
// This reproduces the bail itself (by corrupting the parent's stored baseline to force a
// mismatch, standing in for a live dual-commit race) and proves the fix: a microtask retry
// against the owning component recovers the dropped update instead of losing it permanently.

import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { vnodeMetadata } from "../renderer/storage.js";

describe("reconcileChildren staleness-guard bail must not drop the update permanently", () => {
  it("recovers via a microtask retry when a genuine count mismatch bails the pass", async () => {
    let leaf: InstanceType<typeof Leaf> | null = null;

    class Leaf extends SwissComponent {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(props: any) {
        super(props);
        leaf = this;
      }
      render() {
        return jsx("span", { class: "leaf", children: this.props.label ? "on" : "off" });
      }
    }

    class Middle extends SwissComponent {
      flag = false;
      render() {
        return jsx("div", {
          class: "middle",
          children: [jsx("span", { class: "tag" }), jsx(Leaf, { label: this.flag })],
        });
      }
    }

    class Root extends SwissComponent {
      render() {
        return jsx("div", { class: "root", children: [jsx(Middle, {})] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Root, {}), container);

    const middleEl = container.querySelector(".middle") as HTMLElement;
    expect(middleEl).not.toBeNull();
    expect(leaf!.props.label).toBe(false);

    // Corrupt the stored baseline for `.middle` to simulate a stale/racing commit pipeline's
    // view: it believes there are 3 children when only 2 are actually live. This is exactly
    // the condition reconcileChildren's guard exists to detect.
    const staleBaseline = vnodeMetadata.get(middleEl) as { children: unknown[] };
    const corrupted = { ...staleBaseline, children: [...staleBaseline.children, jsx("span", {})] };
    vnodeMetadata.set(middleEl, corrupted as never);

    // The real state change -- flips the prop that should reach Leaf.
    const storage = await import("../renderer/storage.js");
    const middleInstance = storage.componentInstances.get(middleEl) as InstanceType<typeof Middle>;
    middleInstance.flag = true;
    middleInstance.scheduleUpdate();

    // Immediately after: the corrupted baseline means the guard bailed, so the update must NOT
    // have landed yet -- proves this test is actually exercising the bail path, not a no-op.
    expect(leaf!.props.label).toBe(false);

    // Let the retry microtask run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The retry must have recovered the dropped update.
    expect(leaf!.props.label).toBe(true);
    expect(middleEl.querySelector(".leaf")?.textContent).toBe("on");
  });

  it("does not retry indefinitely when the mismatch is persistent, not transient", async () => {
    // A structural bug elsewhere (not a race) can make a component's own baseline disagree with
    // its live DOM on every single attempt. The retry must give up after a small bounded number
    // of attempts instead of re-triggering scheduleUpdate() forever -- confirmed necessary while
    // validating this fix: an unrelated live component's retry loop tripped UpdateManager's own
    // 60-updates/second throttle warning ("Possible infinite loop"), which is exactly the failure
    // mode a retry-without-a-cap would reintroduce.
    class Leaf extends SwissComponent {
      render() {
        return jsx("span", { class: "leaf" });
      }
    }

    class Middle extends SwissComponent {
      render() {
        return jsx("div", { class: "middle2", children: [jsx("span", {}), jsx(Leaf, {})] });
      }
    }

    class Root extends SwissComponent {
      render() {
        return jsx("div", { class: "root2", children: [jsx(Middle, {})] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Root, {}), container);

    const middleEl = container.querySelector(".middle2") as HTMLElement;
    const storage = await import("../renderer/storage.js");
    const middleInstance = storage.componentInstances.get(middleEl) as InstanceType<typeof Middle>;

    let scheduleUpdateCalls = 0;
    const origScheduleUpdate = middleInstance.scheduleUpdate.bind(middleInstance);
    middleInstance.scheduleUpdate = () => {
      scheduleUpdateCalls++;
      // Re-corrupt on every attempt so the guard bails every single time -- a persistent
      // mismatch, not a one-off race.
      const stale = vnodeMetadata.get(middleEl) as { children: unknown[] };
      vnodeMetadata.set(middleEl, { ...stale, children: [...stale.children, jsx("span", {})] } as never);
      return origScheduleUpdate();
    };

    middleInstance.scheduleUpdate();
    // Drain a generous number of microtask turns -- enough for an uncapped retry to have spun
    // many times over, not just the legitimate few attempts the cap allows.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    expect(scheduleUpdateCalls).toBeLessThanOrEqual(4); // 1 initial + capped retries
  });
});
