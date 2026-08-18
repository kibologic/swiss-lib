/**
 * @vitest-environment jsdom
 */
/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// FRAME-WA-002: a third-party widget (ECharts, in the shipped case) that paints into a
// component-owned container via direct DOM manipulation -- invisible to the vdom -- has been
// worked around in product code (alpine-ui's chart-host.ui startChartWatchdog, a 400ms poll
// that detects `el.children.length === 0` and repairs) since the workaround's own comment claims
// "a re-render for a reason unrelated to chart data can wipe that child, or even replace the
// container element itself with a fresh (empty) one, and neither `updated()` nor a
// MutationObserver reliably catches every such case."
//
// This reproduces the claim with framework primitives alone, no chart library: a component
// mounts a container div declared with zero vdom children, imperatively appends a real child to
// it in mounted() (the same shape ECharts's init() does), then triggers a re-render for a reason
// completely unrelated to that child (an unrelated sibling's prop flips). Asserts whether the
// imperatively-appended child survives.

import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

describe("a re-render unrelated to an imperatively-painted container", () => {
  it("does not wipe or replace a child the vdom never knew about", async () => {
    let hostInstance: InstanceType<typeof Host> | null = null;

    class Host extends SwissComponent {
      unrelatedFlag = false;

      mounted() {
        hostInstance = this;
      }

      render() {
        return jsx("div", {
          class: "card",
          children: [
            // The container the widget paints into -- declared with NO children in the
            // template, exactly like Chart.uix/AnalyticsCard.uix's <div id={this.chartId}>.
            jsx("div", { id: "imperative-host" }),
            // An unrelated sibling whose own change is what triggers the re-render under
            // test -- nothing about it touches #imperative-host.
            jsx("span", { class: "unrelated", children: this.unrelatedFlag ? "on" : "off" }),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);

    // mounted() fires while the built tree is still detached (createDOMNode returns it before
    // renderToDOM inserts it into `container`), so a real widget's init -- which needs a live,
    // laid-out element -- necessarily happens after mount, not during it. Defer the imperative
    // paint the same way: by the next microtask the tree is attached.
    await Promise.resolve();
    const host = document.getElementById("imperative-host") as HTMLElement;
    expect(host).not.toBeNull();
    const canvas = document.createElement("canvas");
    canvas.className = "imperatively-painted";
    host.appendChild(canvas);
    expect(host.querySelector("canvas.imperatively-painted")).not.toBeNull();

    // The re-render under test: unrelated state flips, forcing Host to re-render its whole
    // tree (both the unrelated <span> AND the imperatively-painted <div> get re-diffed).
    hostInstance!.unrelatedFlag = true;
    hostInstance!.scheduleUpdate();

    // scheduleUpdate is RAF-scheduled; flush it the same way the existing reconcile repro
    // tests in this directory do (microtask + macrotask drain covers both RAF and any
    // follow-up microtask retry the reconciler's own staleness guard might schedule).
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Prove the re-render actually happened (the thing it changed took effect) -- otherwise a
    // pass here would prove nothing about re-renders at all.
    expect(container.querySelector(".unrelated")?.textContent).toBe("on");

    // The actual claim under test.
    const hostAfter = document.getElementById("imperative-host") as HTMLElement | null;
    expect(hostAfter).not.toBeNull(); // did the container element itself get replaced?
    expect(hostAfter?.querySelector("canvas.imperatively-painted")).not.toBeNull(); // did its child survive?
  });

  it("also survives when the PARENT re-renders and passes the host component new props", async () => {
    // Distinct trigger path from the test above: there the component holding the imperatively
    // painted div re-rendered itself (component.scheduleUpdate() -> updateWithDomNode /
    // handleNoUpdatePath). Here a PARENT re-renders and passes new props down
    // (updateChildComponent's path in update-strategies.ts, including its "recovered root"
    // fallback branch for when a component's own _container tracking is absent) -- a
    // meaningfully different code path through the same renderer.
    let parentInstance: InstanceType<typeof Parent> | null = null;

    class ChartLike extends SwissComponent {
      mounted() {
        /* real widget init would happen here, asynchronously, after attach */
      }
      render() {
        return jsx("div", { id: "imperative-host-2" });
      }
    }

    class Parent extends SwissComponent {
      unrelatedFlag = false;
      render() {
        return jsx("div", {
          class: "parent-card",
          children: [
            jsx(ChartLike, {}),
            jsx("span", { class: "unrelated-2", children: this.unrelatedFlag ? "on" : "off" }),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Parent, {}), container);
    parentInstance = (await import("../renderer/storage.js")).componentInstances.get(
      container.querySelector(".parent-card") as HTMLElement,
    ) as InstanceType<typeof Parent> | undefined ?? null;

    await Promise.resolve();
    const host2 = document.getElementById("imperative-host-2") as HTMLElement;
    expect(host2).not.toBeNull();
    const canvas2 = document.createElement("canvas");
    canvas2.className = "imperatively-painted-2";
    host2.appendChild(canvas2);

    expect(parentInstance).not.toBeNull();
    parentInstance!.unrelatedFlag = true;
    parentInstance!.scheduleUpdate();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector(".unrelated-2")?.textContent).toBe("on");

    const host2After = document.getElementById("imperative-host-2") as HTMLElement | null;
    expect(host2After).not.toBeNull();
    expect(host2After?.querySelector("canvas.imperatively-painted-2")).not.toBeNull();
  });
});
