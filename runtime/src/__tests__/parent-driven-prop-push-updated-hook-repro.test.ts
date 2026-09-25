/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Evidence for the office PDF-viewer "route switch shows the old book" symptom (see office
// frontend/app/src/components/PdfViewerPage.uix and fable/framework/FABLE-FRAME-008 §7).
//
// The question this file answers (Article 16, attribution before fixes): when a routed page
// component is REUSED with a new prop (the router pushes a new `resourceId` without remounting
// the component -- updateComponentNode's parent-driven commit path, not the child's own
// commitVNode/performUpdate paths), does (a) render() reflect the new prop, and (b) does the
// lifecycle hook the app relies on to react to the change actually fire?
//
// FINDING: (a) yes, render() always reflects new props -- SwissComponent has no stale-render
// path here. (b) `this.on("updated", cb)` DOES fire on this path, but only because of
// FRAME-updated-hook-child-components (PR #135, commit 7b2d0e9, merged 2026-09-16) --
// updateComponentNode now calls executeHookPhase("updated") after a parent-driven commit. A
// bare method literally named `onUpdate(prevProps)` on the component class is NOT a lifecycle
// hook in this framework at any point in the compiler or runtime (verified by grep across
// compiler/src and runtime/src: zero references) and is never invoked by anything -- it is
// exactly as dead as any other unused method. office's PdfViewerPage.uix defines such a method
// and it is never called; ensureViewerSetup, wired correctly via `this.on("updated", ...)` in
// the same component, IS reached on every parent-driven prop push. This isolates the office bug
// to an app-side wiring mistake (assuming an `onUpdate(prevProps)` convention that swiss-lib has
// never had), not a framework defect -- see the companion office-side fix and its own RED/GREEN
// test (frontend/app/src/pdf-resource-switch-refresh.test.mjs).
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

describe("parent-driven prop push into a reused routed page (office PdfViewerPage shape)", () => {
  it("'updated' hook fires and render() reflects the new prop when a parent pushes it without remounting", async () => {
    const log: string[] = [];

    class RoutedPage extends SwissComponent {
      props!: { resourceId: string };
      // The CORRECT wiring: matches office's ensureViewerSetup, which does fire.
      mounted() {
        this.on("updated", () => log.push(`updated:${this.props.resourceId}`));
      }
      render() {
        return jsx("div", { "data-testid": "page", children: `resource:${this.props.resourceId}` });
      }
      // The shape office's PdfViewerPage actually shipped -- a bare method with no wiring
      // anywhere in the framework. Included to prove, empirically, that it is never called.
      onUpdate(_prevProps: { resourceId: string }) {
        log.push("onUpdate-bare-method-called");
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
        // Router shape: same RoutedPage position, no key -- a route change re-renders this
        // Host, which pushes a new prop into the SAME child instance (reuse, not remount).
        return jsx("div", { children: [jsx(RoutedPage, { resourceId: this.state.resourceId })] });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="page"]')?.textContent).toBe("resource:book-1");

    host!.state.resourceId = "book-2";
    await flush();

    expect(
      container.querySelector('[data-testid="page"]')?.textContent,
      "render() must reflect the new prop after a parent-driven push",
    ).toBe("resource:book-2");

    // At least one "updated" fires for the new prop (this framework's commit pipeline can
    // legitimately revisit a position more than once per flush; that duplication is not this
    // test's concern -- see commitvnode-updated-hook-repro.test.ts for that guarantee's own
    // coverage). What matters here: it fires AT ALL on a parent-driven push, and the bare
    // onUpdate(prevProps) method -- what office's PdfViewerPage actually relies on -- never does.
    expect(log.every((entry) => entry === "updated:book-2"), `unexpected log entries: ${log.join(", ")}`).toBe(
      true,
    );
    expect(log.length, "'updated' (via this.on) must fire on a parent-driven prop push").toBeGreaterThan(0);
    expect(log, "a bare onUpdate(prevProps) method must never be invoked by the framework").not.toContain(
      "onUpdate-bare-method-called",
    );
  });
});
