/** @vitest-environment jsdom */
/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// Regression repro for the office study-reader "chapter switch doesn't reflect" bug.
//
// Existing repros (stuck-loading-child-prop-repro, child-prop-update-repro) cover a
// two-level parent -> child prop push. The live reader failure is deeper and passes
// through a passthrough wrapper:
//
//   App (state.chapterId)                     <- the re-render source
//     └─ ErrorBoundary (renders this.props.children)   <- passthrough wrapper
//          └─ ReaderEngine (reads props.chapterId,      <- intermediate: derives a NEW
//               derives chapter = BOOK[id])                object prop for its own child
//               └─ ProseEngine (renders chapter.content) <- leaf that must repaint
//
// When App re-renders in place with a new chapterId, the change has to propagate
// grandparent -> (passthrough) -> intermediate -> leaf. Live symptom: ReaderEngine.render
// never re-runs, so ProseEngine keeps the first chapter's content. Reproduce that here.
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToDOM } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

const BOOK: Record<string, { id: string; content: string }> = {
  "ch-1": { id: "ch-1", content: "Chapter One body" },
  "ch-2": { id: "ch-2", content: "Chapter Two body" },
  "ch-3": { id: "ch-3", content: "Chapter Three body" },
};

describe("nested grandchild prop through a passthrough wrapper (office reader)", () => {
  it("leaf repaints when the grandparent flips a prop across a passthrough + intermediate", async () => {
    let app: App | null = null;

    class ProseEngine extends SwissComponent {
      render() {
        const chapter = (this.props as { chapter?: { id: string; content: string } }).chapter;
        return jsx("div", { class: "prose", children: chapter ? chapter.content : "(no chapter)" });
      }
    }

    class ReaderEngine extends SwissComponent {
      render() {
        const chapterId = (this.props as { chapterId?: string }).chapterId ?? "ch-1";
        const chapter = BOOK[chapterId];
        return jsx("div", { class: "reader", children: [jsx(ProseEngine, { chapter })] });
      }
    }

    // ErrorBoundary, modelled on core's real one: renderWithBoundary returns the SINGLE
    // child DIRECTLY (no wrapping DOM element). So ErrorBoundary.render() output IS the
    // ReaderEngine component vnode — a component whose render returns another component,
    // both mapping to the same DOM node. THIS is what the passing repro was missing.
    class ErrorBoundary extends SwissComponent {
      render() {
        const children = (this.props as { children?: unknown[] }).children ?? [];
        return children.length === 1 ? (children[0] as never) : jsx("div", { children });
      }
    }

    class App extends SwissComponent {
      state = { chapterId: "ch-1" } as { chapterId: string };
      constructor(p: unknown) {
        super(p as never);
        app = this;
      }
      render() {
        return jsx("div", {
          class: "reader-viewport",
          children: [
            jsx(ErrorBoundary, {
              children: [jsx(ReaderEngine, { chapterId: this.state.chapterId })],
            }),
          ],
        });
      }
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    renderToDOM(jsx(App, {}), container);
    await flush();
    expect(container.querySelector(".prose")?.textContent).toBe("Chapter One body");

    // Flip chapters repeatedly — the live bug was intermittent, so assert across cycles.
    const order = ["ch-2", "ch-3", "ch-1", "ch-3", "ch-2", "ch-1"];
    for (const id of order) {
      app!.state.chapterId = id;
      await flush();
      expect(container.querySelector(".prose")?.textContent).toBe(BOOK[id].content);
    }
  });
});
