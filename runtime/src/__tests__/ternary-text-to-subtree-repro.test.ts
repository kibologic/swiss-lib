/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Reproduction for FRAME-WA-005: a component render() that returns
// `cond ? <text> : <rich subtree>` never patches the DOM to the subtree branch once cond
// flips, even though the state driving it changes correctly on every trigger.
//
// Live-confirmed in Nostromo (theunfunded/Nostromo, unrelated app) 2026-08-14: an image
// preview panel stayed on placeholder text forever after upload, though `previewResult` was
// assigned correctly and logged truthy on every change. The SAME component's shallow
// text-to-text swap (a caption string) patched correctly -- only the shape-changing branch
// (text -> deep subtree) got stuck, and repeated later triggers never recovered it.
//
// The state field here uses the exact `private _x$: Signal<T>` + getter/setter pattern the
// compiler emits for `state { let x: T = v; }` (compiler/src/transformers/swiss-syntax.ts,
// parseOneStateDecl) -- NOT a plain `state = {...}` object field. That distinction matters:
// an object-field version of this same test does NOT reproduce the bug (see the control test
// below and its note), because the root cause is specific to how a component's FIRST render()
// return value is used to recover its own instance during mount.
//
// ROOT CAUSE #1 (component-rendering.ts's renderComponent()): a class component's instance
// is threaded back to dom-creation.ts via `rendered.__componentInstance`, where `rendered` is
// render()'s OWN return value. That only works when `rendered` is an object -- a bare
// string/number (a component's own top-level `return "some text"`, with no wrapping element)
// can't carry the marker at all. dom-creation.ts's initial-mount path reads
// `vb(rendered)?.__componentInstance` to find the instance and, only if found, calls
// ci.initialize() -- which is what wires up the reactive render effect (setupReactivity()).
// When render()'s FIRST call returns a bare string, instance recovery silently fails,
// initialize() never runs, and the component never gets a render effect at all: state changes
// afterward flip signals with zero subscribers, so nothing ever re-renders. This mirrors the
// pre-existing FABLE-RENDER-001 D3 fix for null/undefined renders (a few lines below in the
// same function), which was never extended to primitive (string/number/boolean) renders.
//
// ROOT CAUSE #2 (dom-updates.ts's updateDOMNode()): once instance tracking is fixed and the
// render effect DOES fire, the dispatcher that applies a new vnode to an existing DOM node
// routed purely on the NEW vnode's kind, with no check that the EXISTING dom's actual node
// type was compatible. A text-vnode's dom (a real Text node) handed to updateElementNodeFn
// when the new vnode is an element made reconcileChildren try to give that Text node its
// first child -- Text nodes reject child insertion per spec (HierarchyRequestError) -- which
// updateDOMNode's catch turned into a thrown DiffingError, leaving the DOM exactly as before.
//
// Reproduced here with framework primitives only (no application code, no compiler).
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";
import { Signal } from "../reactivity/signals.js";

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("ternary text-to-subtree swap in render() (FRAME-WA-005)", () => {
  it("patches the DOM when a top-level render() ternary flips from bare text to a rich subtree", async () => {
    let host: Host | null = null;

    class Host extends SwissComponent {
      // Exactly what the compiler emits for `state { let ready: boolean = false; }`.
      private _ready$ = new Signal(false);
      private get ready(): boolean {
        return this._ready$.value;
      }
      private set ready(v: boolean) {
        this._ready$.value = v;
      }
      renderCount = 0;
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        this.renderCount++;
        // Exactly the shape described: `cond ? <text> : <rich subtree>` as the component's
        // own top-level render() return -- no stable wrapper (that's the workaround, not
        // the natural shape), and the text branch is BARE text, not wrapped in an element.
        return this.ready
          ? jsx("div", {
              class: "preview",
              children: [
                jsx("img", { "data-testid": "preview-img", src: "blob:x" }),
                jsx("span", { "data-testid": "preview-caption", children: "512x341" }),
              ],
            })
          : "Choose an image to see a live preview.";
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host, {}), container);
    await flush();

    expect(container.textContent).toBe("Choose an image to see a live preview.");
    expect(container.querySelector('[data-testid="preview-img"]')).toBeNull();

    // Flip state -- mirrors `this.previewResult = result` in the real repro.
    host!.ready = true;
    await flush();

    expect(
      container.querySelector('[data-testid="preview-img"]'),
      "rich subtree branch should be mounted after state flips",
    ).not.toBeNull();
    expect(container.textContent).not.toBe("Choose an image to see a live preview.");

    // Discriminating check from the live repro: flipping back and forth again (unrelated
    // repeated triggers) must not leave it permanently stuck either way.
    host!.ready = false;
    await flush();
    expect(container.textContent).toBe("Choose an image to see a live preview.");

    host!.ready = true;
    await flush();
    expect(container.querySelector('[data-testid="preview-img"]')).not.toBeNull();
  });

  it("control: shallow text-to-text swap (element-wrapped) patches correctly -- was never broken", async () => {
    let host: Host2 | null = null;
    class Host2 extends SwissComponent {
      private _loaded$ = new Signal(false);
      private get loaded(): boolean {
        return this._loaded$.value;
      }
      private set loaded(v: boolean) {
        this._loaded$.value = v;
      }
      constructor(p: unknown) {
        super(p as never);
        host = this;
      }
      render() {
        return jsx("p", {
          "data-testid": "caption",
          children: this.loaded ? "golden-512x341.jpg loaded (512x341px)" : "Choose an image to see a live preview.",
        });
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(Host2, {}), container);
    await flush();
    expect(container.querySelector('[data-testid="caption"]')?.textContent).toBe(
      "Choose an image to see a live preview.",
    );
    host!.loaded = true;
    await flush();
    expect(container.querySelector('[data-testid="caption"]')?.textContent).toBe(
      "golden-512x341.jpg loaded (512x341px)",
    );
  });
});
