/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-fragment-sibling-count-mismatch: DOM-patching fault office's PdfViewerPage.uix exposed
// (Article 16 attribution work -- registry/kibologic/swiss-lib task).
//
// Reported symptom: clicking PdfViewerPage's left-sidebar tabs re-renders `leftTab` correctly
// (telemetry confirms it) but the DOM never changes -- not even the clicked tab button's
// `active` class. Investigated as "sibling conditional component swap" (three `{leftTab ===
// 'x' && <XPanel/>}` expressions), but that shape ALONE, and even nested 2-3 levels deep with
// scheduleUpdate() or Signal-driven self-commit, reproduces nothing on current `development`
// (see the first three tests below -- all pass, recorded as negative controls / ruled-out
// hypotheses). Bisecting office's EXACT render() tree (verbatim-nesting test) found the real
// trigger: PdfViewerPage wraps two siblings (`<PdfViewerToolbar/>` and `<main>...</main>`) in a
// single `<>...</>` Fragment (`!docLoading && !docError && (<>...</>)`). Isolated to its true
// minimal shape in the "MINIMAL REPRO" test: ANY Fragment vnode with 2+ children, sitting among
// sibling vnodes (or even alone) in a `children` array, breaks reconciliation for everything
// under it -- because a Fragment creates a document.createDocumentFragment() at mount whose
// children get merged directly into the real parent (DocumentFragments never persist as their
// own node), so it is ONE entry in the logical vnode array but contributes N entries to
// `parent.childNodes`. reconcileChildren's staleness guard (added by the unrelated 2026-07-17
// CLICK-NO-RESPONSE fix, reconciliation.ts) compares the logical count against the live DOM
// count and bails -- silently -- the instant they disagree, which happens on every commit for
// any element with a >1-child Fragment among its direct children.
//
// Attribution (Article 16): framework defect, not application. Reproduced below with framework
// primitives only (renderToDOM + SwissComponent + Signal), no office code or compiler involved.
// Fixed in reconciliation.ts and dom-updates.ts by flattening Fragment (and raw-array) vnodes
// wherever a children array is treated as 1:1 with real DOM nodes (types.ts's new
// flattenRenderedChildren, replacing filterValidVNodes at those call sites).
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx, Fragment } from "../vdom/vdom.js";
import { Signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("FRAME-fragment-sibling-count-mismatch", () => {
  it("MINIMAL REPRO: a Fragment with 2+ children must patch its nested content on update", async () => {
    let host: Host | null = null;
    class Host extends SwissComponent {
      private _tab$ = new Signal<string>("a");
      private get tab(): string { return this._tab$.value; }
      private set tab(v: string) { this._tab$.value = v; }
      constructor(p: unknown) { super(p as never); host = this; }
      setTab(t: string) { this.tab = t; if (this.update) this.update(); }
      render() {
        return jsx("div", {
          class: "outer",
          children: [
            // A single Fragment with 2 children, as the outer div's ONLY child -- no other
            // conditionals, no components, no nesting depth needed.
            jsx(Fragment, {
              children: [
                jsx("div", { "data-testid": "sibling-before" }),
                jsx("span", { "data-testid": "target", children: this.tab }),
              ],
            }),
          ],
        });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();
    expect(container.querySelector('[data-testid="target"]')?.textContent).toBe("a");

    host!.setTab("b");
    await flush();

    expect(
      container.querySelector('[data-testid="target"]')?.textContent,
      "content inside a multi-child Fragment must patch on update",
    ).toBe("b");
  });

  it("CONTROL (passes on current development too): sibling conditional COMPONENT swap alone, no Fragment involved, already patches correctly", async () => {
    class OutlinePanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "outline", children: "Outline" }); }
    }
    class BookmarksPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "bookmarks", children: "Bookmarks" }); }
    }
    class InsightsPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "insights", children: "Insights" }); }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      leftTab = "outline";
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("div", {
          class: "sidebar",
          children: [
            this.leftTab === "outline" && jsx(OutlinePanel, {}),
            this.leftTab === "bookmarks" && jsx(BookmarksPanel, {}),
            this.leftTab === "insights" && jsx(InsightsPanel, {}),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="outline"]')).not.toBeNull();

    host!.leftTab = "bookmarks";
    host!.scheduleUpdate();
    await flush();

    expect(container.querySelector('[data-testid="bookmarks"]'), "bookmarks panel should now be visible").not.toBeNull();
    expect(container.querySelector('[data-testid="outline"]'), "outline panel should be gone").toBeNull();
  });

  // office's leftTab is a compiled `state { let leftTab: string = 'outline' }` field -- a
  // private _leftTab$ Signal + getter/setter, per compiler/src/transformers/swiss-syntax.ts's
  // parseOneStateDecl -- and the click handler just assigns `this.leftTab = 'bookmarks'`, with
  // NO explicit scheduleUpdate() call. That routes through the signal-effect-driven self-commit
  // path (component.ts's commitVNode, queued by reactivity-setup.ts), NOT the
  // scheduleUpdate()/performUpdate() path the test above exercises. This is the exact shape.
  it("CONTROL (passes): Signal state, no scheduleUpdate call -- still no Fragment, still patches fine", async () => {
    class OutlinePanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "outline", children: "Outline" }); }
    }
    class BookmarksPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "bookmarks", children: "Bookmarks" }); }
    }
    class InsightsPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "insights", children: "Insights" }); }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      // Exactly what the compiler emits for `state { let leftTab: string = 'outline'; }`.
      private _leftTab$ = new Signal<string>("outline");
      private get leftTab(): string {
        return this._leftTab$.value;
      }
      private set leftTab(v: string) {
        this._leftTab$.value = v;
      }
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      setLeftTab(tab: string) {
        this.leftTab = tab;
      }
      render() {
        return jsx("div", {
          class: "sidebar",
          children: [
            this.leftTab === "outline" && jsx(OutlinePanel, {}),
            this.leftTab === "bookmarks" && jsx(BookmarksPanel, {}),
            this.leftTab === "insights" && jsx(InsightsPanel, {}),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="outline"]')).not.toBeNull();

    // No scheduleUpdate() -- mirrors `setLeftTab()` in PdfViewerPage.uix exactly: a plain
    // assignment to the compiled state field, relying on the reactive effect alone.
    host!.setLeftTab("bookmarks");
    await flush();

    expect(container.querySelector('[data-testid="bookmarks"]'), "bookmarks panel should now be visible").not.toBeNull();
    expect(container.querySelector('[data-testid="outline"]'), "outline panel should be gone").toBeNull();
  });

  // Verbatim structural shape of PdfViewerPage.uix's render() (see office/frontend/app/src/
  // components/PdfViewerPage.uix:443-570): the sidebar's 3-way conditional sits nested inside
  // TWO more conditionals that stay constant across a tab click -- a top-level
  // `{!docLoading && !docError && (<>...</>)}` Fragment, then `{!focusMode && (<aside>...)}` --
  // plus real sibling elements/components at every level (toolbar, tab buttons, canvas section,
  // right rail). Only the innermost 3-way slot's truthiness changes when a tab is clicked.
  it("REPRO (verbatim office nesting): tab click fails to patch anything once the sidebar sits under PdfViewerPage's real Fragment-wrapped shape", async () => {
    class Toolbar extends SwissComponent {
      render() { return jsx("div", { "data-testid": "toolbar", children: "Toolbar" }); }
    }
    class OutlinePanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "outline", children: "Outline" }); }
    }
    class BookmarksPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "bookmarks", children: "Bookmarks" }); }
    }
    class InsightsPanel extends SwissComponent {
      render() { return jsx("div", { "data-testid": "insights", children: "Insights" }); }
    }
    class RightRail extends SwissComponent {
      render() { return jsx("div", { "data-testid": "rail", children: "Rail" }); }
    }

    let host: Host | null = null;
    class Host extends SwissComponent {
      private _leftTab$ = new Signal<string>("outline");
      private get leftTab(): string { return this._leftTab$.value; }
      private set leftTab(v: string) { this._leftTab$.value = v; }
      docLoading = false;
      docError = "";
      focusMode = false;
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      setLeftTab(tab: string) {
        this.leftTab = this.leftTab === tab ? "" : tab;
        if (this.update) this.update();
      }
      render() {
        return jsx("div", {
          class: "pdf-viewer-page",
          children: [
            this.docLoading && jsx("div", { children: "loading" }),
            !this.docLoading && this.docError && jsx("div", { children: this.docError }),
            !this.docLoading && !this.docError && jsx(Fragment, {
              children: [
                jsx(Toolbar, {}),
                jsx("main", {
                  class: "engine-bay",
                  children: [
                    !this.focusMode && jsx("aside", {
                      class: "engine-sidebar",
                      children: [
                        jsx("div", {
                          class: "sidebar-tabs",
                          children: [
                            jsx("button", {
                              class: `tab-btn ${this.leftTab === "outline" ? "active" : ""}`,
                              "data-testid": "tab-outline",
                              onClick: () => this.setLeftTab("outline"),
                              children: "Outline",
                            }),
                            jsx("button", {
                              class: `tab-btn ${this.leftTab === "bookmarks" ? "active" : ""}`,
                              "data-testid": "tab-bookmarks",
                              onClick: () => this.setLeftTab("bookmarks"),
                              children: "Bookmarks",
                            }),
                            jsx("button", {
                              class: `tab-btn ${this.leftTab === "insights" ? "active" : ""}`,
                              "data-testid": "tab-insights",
                              onClick: () => this.setLeftTab("insights"),
                              children: "Insights",
                            }),
                          ],
                        }),
                        jsx("div", {
                          class: "sidebar-panel",
                          children: [
                            this.leftTab === "outline" && jsx(OutlinePanel, {}),
                            this.leftTab === "bookmarks" && jsx(BookmarksPanel, {}),
                            this.leftTab === "insights" && jsx(InsightsPanel, {}),
                          ],
                        }),
                      ],
                    }),
                    jsx("section", { class: "pdf-viewer-canvas-wrap" }),
                    false,
                    false,
                    !this.focusMode && jsx(RightRail, {}),
                  ],
                }),
              ],
            }),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.querySelector('[data-testid="outline"]')).not.toBeNull();
    const outlineBtn = container.querySelector('[data-testid="tab-outline"]') as HTMLButtonElement;
    expect(outlineBtn.className).toContain("active");

    const bookmarksBtn = container.querySelector('[data-testid="tab-bookmarks"]') as HTMLButtonElement;
    bookmarksBtn.click();
    await flush();

    expect(bookmarksBtn.className, "clicked tab button should gain 'active'").toContain("active");
    expect(
      (container.querySelector('[data-testid="tab-outline"]') as HTMLButtonElement).className,
      "previously active tab button should lose 'active'",
    ).not.toContain("active");
    expect(container.querySelector('[data-testid="bookmarks"]'), "bookmarks panel should now be visible").not.toBeNull();
    expect(container.querySelector('[data-testid="outline"]'), "outline panel should be gone").toBeNull();
  });
});
