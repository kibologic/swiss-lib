/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// FRAME-006-follow-up: renderToStream. swiss-lib has renderToString (renderer.ts) but no
// streaming SSR entry point. This file deliberately carries no jsdom environment pragma --
// see ssr-no-dom-environment.test.ts's header for why that matters (this package's default
// vitest environment is plain 'node', and a real streaming SSR deployment has no `document`
// global). Do not write the literal at-sign-vitest-environment-jsdom pragma anywhere in this
// file, even in prose -- vitest's pragma scanner matches it in leading comments regardless.
//
// Design (see runtime/src/renderer/ssr-stream.ts): renderToString (this file's baseline of
// truth) is a single synchronous recursive string-builder. renderToStream reuses the exact
// same per-vnode HTML-generation logic (renderNodeToString, extracted from renderToString
// with identical behaviour -- text escaping, element attrs, void tags, ssrId, component
// dispatch, the SSR-002 error-boundary fallback) but drives it from a generator
// (renderToStringChunks) that walks the SAME tree renderToString walks and yields one chunk
// per top-level child of the root instead of building one giant string. Concatenating every
// yielded chunk must therefore equal renderToString's output for the identical tree -- same
// function, same recursion, just yielding instead of accumulating at the outermost level.
//
// Correctness bar (this task): (a) full concatenation === renderToString output for the same
// component tree: (b) the chunks actually arrive as MORE THAN ONE chunk (proves streaming,
// not a single buffered write); (c) hydration is unaffected -- renderToStream's HTML is
// byte-identical to renderToString's, so any hydration test that already passes against
// renderToString's output passes identically against a stream-collected string (proven here
// via the shared collectStream() helper landing at the same asserted markup).
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { renderToString } from "../renderer/renderer.js";
import {
  renderToStream,
  renderToStreamWeb,
  renderToStringChunks,
} from "../renderer/ssr-stream.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

class Counter extends SwissComponent {
  state = { count: (this.props as { start?: number }).start ?? 0 } as { count: number };
  render() {
    return jsx("button", { class: "counter", children: `count: ${this.state.count}` });
  }
}

class Layout extends SwissComponent {
  render() {
    return jsx("div", { class: "layout", children: this.props.children as never });
  }
}

class Page extends SwissComponent {
  render() {
    return jsx("main", {
      children: [
        jsx("h1", { children: "Title" }),
        jsx(Counter, { start: 1 }),
        jsx("p", { children: "footer text" }),
      ],
    });
  }
}

/** Collects a Node Readable stream into a single string, recording each chunk seen. */
async function collectNodeStream(readable: Readable): Promise<{ html: string; chunks: string[] }> {
  const chunks: string[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
  }
  return { html: chunks.join(""), chunks };
}

/** Collects a Web ReadableStream into a single string, recording each chunk seen. */
async function collectWebStream(stream: ReadableStream<string>): Promise<{ html: string; chunks: string[] }> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return { html: chunks.join(""), chunks };
}

describe("renderToStream: parity with renderToString", () => {
  it("concatenated stream output equals renderToString output for a simple element", async () => {
    const vnode = jsx("div", { class: "layout", children: jsx("span", { children: "leaf" }) });
    const expected = renderToString(vnode);

    const { html, chunks } = await collectNodeStream(renderToStream(vnode));

    expect(html).toBe(expected);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("concatenated stream output equals renderToString output for a multi-child real-component tree", async () => {
    const vnode = jsx(Page, {});
    const expected = renderToString(vnode);
    expect(expected).toBe(
      '<main><h1>Title</h1><button class="counter">count: 1</button><p>footer text</p></main>',
    );

    const { html, chunks } = await collectNodeStream(renderToStream(vnode));

    expect(html).toBe(expected);
    // Page's own render() returns a single <main> element with THREE top-level children
    // (h1, Counter, p) -- renderToStringChunks flushes the shell open tag immediately, then
    // one chunk per top-level child, so this must be strictly more than one chunk.
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("streams a nested layout+leaf tree (the shape router's ServerRenderer builds) with parity", async () => {
    const vnode = jsx(Layout, { children: jsx("span", { children: "Docs" }) });
    const expected = renderToString(vnode);
    expect(expected).toBe('<div class="layout"><span>Docs</span></div>');

    const { html, chunks } = await collectNodeStream(renderToStream(vnode));

    expect(html).toBe(expected);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("a component that throws still streams the SSR-002 error-boundary fallback, matching renderToString", async () => {
    class Boom extends SwissComponent {
      render(): never {
        throw new Error("kaboom");
      }
    }
    const vnode = jsx("div", { children: [jsx("span", { children: "before" }), jsx(Boom, {})] });
    const expected = renderToString(vnode);
    expect(expected).toContain('data-swiss-error-boundary="true"');

    const { html } = await collectNodeStream(renderToStream(vnode));
    expect(html).toBe(expected);
  });

  it("renderToStringChunks (the underlying generator) yields more than one string chunk", () => {
    const vnode = jsx(Page, {});
    const chunks = Array.from(renderToStringChunks(vnode));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(renderToString(vnode));
  });

  it("flushes the opening shell chunk before later chunks are produced (true incremental flush, not buffer-then-split)", async () => {
    // Prove ordering, not just chunk count: the FIRST chunk out of the generator must be
    // producible before the SECOND top-level child has been rendered at all. We simulate
    // this with a component whose render() records when it was called relative to
    // iteration, using a generator consumed lazily (for...of over an iterator, one step at
    // a time) rather than collected eagerly.
    const order: string[] = [];
    class First extends SwissComponent {
      render() {
        order.push("first-rendered");
        return jsx("span", { children: "1" });
      }
    }
    class Second extends SwissComponent {
      render() {
        order.push("second-rendered");
        return jsx("span", { children: "2" });
      }
    }
    const vnode = jsx("div", { children: [jsx(First, {}), jsx(Second, {})] });

    const iterator = renderToStringChunks(vnode)[Symbol.iterator]();
    const step1 = iterator.next(); // shell open tag: <div>
    expect(order).toEqual([]); // nothing rendered yet -- shell flushed first
    expect(step1.done).toBe(false);

    const step2 = iterator.next(); // first child chunk
    expect(order).toEqual(["first-rendered"]);
    expect(order).not.toContain("second-rendered"); // Second not yet rendered

    const step3 = iterator.next(); // second child chunk
    expect(order).toEqual(["first-rendered", "second-rendered"]);

    // Drain the rest.
    let done = false;
    while (!done) {
      const r = iterator.next();
      done = r.done ?? false;
    }
  });
});

describe("renderToStream: Web ReadableStream parity", () => {
  it("concatenated Web stream output equals renderToString output", async () => {
    const vnode = jsx(Page, {});
    const expected = renderToString(vnode);

    const { html, chunks } = await collectWebStream(renderToStreamWeb(vnode));

    expect(html).toBe(expected);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("renderToStream: hydration parity (streamed HTML hydrates identically to renderToString's)", () => {
  it("the streamed-and-collected HTML is byte-identical to renderToString's, so it hydrates the same DOM shape", async () => {
    // Hydration itself is exercised end-to-end against renderToString's output in
    // ssr-hydration-round-trip.test.ts (jsdom-only, so it lives in its own file). What this
    // test proves is the precondition that makes that coverage transfer to streaming for
    // free: the streamed HTML a browser would actually receive is byte-for-byte the same
    // markup, so hydrate() -- which only ever reads DOM structure/tag names built from
    // parsed HTML, never how many chunks the network delivered it in -- cannot behave any
    // differently. There is nothing streaming-specific for hydration to break, because no
    // streaming-specific markup is emitted.
    const vnode = jsx(Counter, { start: 3 });
    const expected = renderToString(vnode);
    expect(expected).toBe('<button class="counter">count: 3</button>');

    const { html } = await collectNodeStream(renderToStream(vnode));
    expect(html).toBe(expected);
  });
});
