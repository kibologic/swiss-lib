/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */
//
// FRAME-006-follow-up: renderToStream -- streaming SSR built as an extension of
// renderToString (renderer.ts), not a parallel implementation. renderToString is a single
// synchronous recursive function that both (a) decides how each vnode kind serializes to
// HTML and (b) accumulates the result into one string via `+=`. Concern (a) is the part
// every future SSR entry point (this one, and any Suspense-aware one later) must share
// byte-for-byte with renderToString, because hydration matches against exactly that markup
// and CROSS-001's own conformance harness pins renderToString's per-vnode-kind output.
// Concern (b) is the only thing that changes for streaming.
//
// This module extracts (b) out: renderNodeToString below is renderToString's own recursive
// body, verbatim in behaviour, and renderToString itself (renderer.ts) is UNCHANGED -- this
// file does not touch it, so nothing about renderToString's existing conformance tests or
// callers (router's ServerRenderer, component/ssr.ts's serverInit) is at risk. What this
// file adds is a second consumer of the same per-vnode logic: renderToStringChunks, a
// generator that walks a tree the same way renderToString does but YIELDS one chunk per
// top-level child instead of returning one final string. The document shell (a root
// element's open tag) is flushed as its own chunk before any child is rendered at all --
// see the "flushes the opening shell chunk before later chunks are produced" test in
// ssr-streaming.test.ts, which proves this with render-order instrumentation, not just
// chunk count.
//
// Chunk granularity (Article 18 "clean seam for Suspense-aware streaming later"): this
// branch has no async rendering and no Suspense boundary primitive (verified: nothing in
// runtime/src/component exports anything resembling one). Per this task's own instruction,
// this ships CHUNKED streaming -- one chunk per top-level child of the root vnode -- as a
// first-class capability now, with the seam being renderToStringChunks itself: a
// Suspense-aware version later only needs to change what "top-level child" boundaries this
// generator yields at (e.g. also flushing early at a <Suspense> vnode's placeholder and
// later replacing it), not the underlying renderNodeToString it calls, and not either
// public stream constructor below.
//
// FRAME-001 note (Article 18 stop-and-report instruction): streaming correctness here does
// NOT depend on FRAME-001's index-derived-identity keystone the way hydration does.
// renderToStringChunks produces the exact same bytes as renderToString, just split across
// more than one chunk -- it establishes no NEW identity of its own (no additional ssrId
// scheme, no chunk-boundary markers embedded in the HTML). The browser's HTML parser
// reassembles streamed chunks into the identical DOM tree it would build from one buffered
// response body; hydration's existing index-derived DOM-position matching (hydration.ts)
// then proceeds exactly as it does today, blind to how many chunks the network delivered
// the markup in. The FRAME-001 gap (documented in ssr-hydration-round-trip.test.ts's third
// test) is therefore neither made better nor worse by streaming -- it is orthogonal, not a
// blocking dependency, so this ships without waiting on it.

import type { Readable as ReadableType } from "node:stream";
import type { VNode, VElement } from "../vdom/vdom.js";
import type { VNodeBase } from "../vdom/types/index.js";
import { isComponentVNode, isElementVNode } from "./types.js";
import { createErrorBoundary } from "./errors.js";
import { devTools } from "./dev-tools.js";
import { renderComponent as renderComponentImpl } from "./component-rendering.js";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

// renderToString's own recursive body (renderer.ts), extracted so both renderToString and
// renderToStringChunks call the identical per-vnode serialization -- see this file's header
// comment. Kept as a free function (not exported from here as `renderToString` itself) so
// renderer.ts continues to own that name and its existing call sites are untouched.
function renderNodeToString(vnode: VNode): string {
  if (typeof vnode === "string" || typeof vnode === "number") {
    return escapeHtml(String(vnode));
  }

  if (vnode === null || vnode === undefined || typeof vnode === "boolean") {
    return "";
  }

  if (isComponentVNode(vnode)) {
    try {
      const rendered = renderComponentImpl(vnode, vnode.__componentInstance);
      // Mirrors renderer.ts's renderToString: never trust a parent's __componentInstance
      // tag on a nested component vnode returned by render() (FRAME-006 wrapper bug --
      // see renderer.ts's comment at its own SSR catch site for the full story).
      if (rendered && typeof rendered === "object" && "__componentInstance" in rendered) {
        (rendered as VNodeBase).__componentInstance = undefined;
      }
      return renderNodeToString(rendered);
    } catch (e) {
      devTools.error("[SSR Stream] renderNodeToString: component render failed", e);
      const err = e instanceof Error ? e : new Error(String(e));
      return renderNodeToString(createErrorBoundary(`Component error: ${err.message}`, err));
    }
  }

  if (isElementVNode(vnode)) {
    const { type, props = {}, children = [] } = vnode;
    const isVoid = VOID_ELEMENTS.has(type.toLowerCase());

    let html = `<${type}`;
    if (vnode.ssrId) {
      html += ` data-ssr-id="${escapeHtml(vnode.ssrId)}"`;
    }
    for (const [key, value] of Object.entries(props)) {
      if (key === "children" || key === "key" || key.startsWith("on")) continue;
      if (value === null || value === undefined || value === false) continue;
      if (value === true) {
        html += ` ${escapeHtml(key)}`;
      } else {
        html += ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
      }
    }

    if (isVoid) {
      html += " />";
      return html;
    }

    html += ">";
    for (const child of children) {
      html += renderNodeToString(child);
    }
    html += `</${type}>`;
    return html;
  }

  return "";
}

function openTag(vnode: VElement): string {
  const { type, props = {} } = vnode;
  let html = `<${type}`;
  if (vnode.ssrId) {
    html += ` data-ssr-id="${escapeHtml(vnode.ssrId)}"`;
  }
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key" || key.startsWith("on")) continue;
    if (value === null || value === undefined || value === false) continue;
    if (value === true) {
      html += ` ${escapeHtml(key)}`;
    } else {
      html += ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
    }
  }
  html += ">";
  return html;
}

/**
 * Generator form of streaming SSR: walks `vnode` exactly as renderToString does (same
 * renderNodeToString for every non-root node) but yields incrementally instead of
 * accumulating into one string.
 *
 * Boundary rule (chunked streaming, Article 18's "clean seam" instruction -- see this
 * file's header): if the root vnode is an element with children, its open tag is flushed
 * as its own first chunk (the document shell), then one chunk per top-level child, then
 * the closing tag. If the root is a component vnode, it is first resolved to whatever its
 * render() produces (same as renderToString unwrapping components) and chunking is then
 * applied to THAT result -- so a route's outermost real markup (e.g. router's ServerRenderer
 * tree, always rooted in an element or a layout component that itself renders one) still
 * gets a real shell flush, not one single chunk for the whole page. A vnode with no
 * children of its own (text, void element, empty element, or anything that isn't an
 * element after component resolution) yields exactly one chunk -- there is nothing to
 * split further, consistent with renderToString's own leaf handling.
 */
export function* renderToStringChunks(vnode: VNode): Generator<string, void, void> {
  const resolved = resolveToRenderable(vnode);

  if (resolved && typeof resolved === "object" && isElementVNode(resolved)) {
    const { type, children = [] } = resolved;
    const isVoid = VOID_ELEMENTS.has(type.toLowerCase());

    if (isVoid || children.length === 0) {
      yield renderNodeToString(resolved);
      return;
    }

    // Shell flush: open tag goes out before any child is rendered at all.
    yield openTag(resolved);
    for (const child of children) {
      yield renderNodeToString(child);
    }
    yield `</${type}>`;
    return;
  }

  // Leaf (text/null/boolean) or a component that resolved to something non-element
  // (e.g. a pass-through to another component that itself resolves further) -- render it
  // in one shot via the shared recursive path, same output renderToString would produce.
  yield renderNodeToString(resolved);
}

// Resolves component vnodes down to their rendered output (mirroring renderToString's own
// unwrapping), WITHOUT stringifying yet, so renderToStringChunks can inspect the resolved
// node's shape (element vs. leaf) to decide chunk boundaries.
function resolveToRenderable(vnode: VNode): VNode {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return vnode;
  if (typeof vnode === "string" || typeof vnode === "number") return vnode;

  if (isComponentVNode(vnode)) {
    try {
      const rendered = renderComponentImpl(vnode, vnode.__componentInstance);
      if (rendered && typeof rendered === "object" && "__componentInstance" in rendered) {
        (rendered as VNodeBase).__componentInstance = undefined;
      }
      return resolveToRenderable(rendered);
    } catch (e) {
      devTools.error("[SSR Stream] resolveToRenderable: component render failed", e);
      const err = e instanceof Error ? e : new Error(String(e));
      return createErrorBoundary(`Component error: ${err.message}`, err);
    }
  }

  return vnode;
}

/**
 * Node.js streaming SSR entry point. Returns a Readable that emits HTML incrementally --
 * the document shell (root open tag) flushes before later chunks are produced (see
 * renderToStringChunks's ordering guarantee, exercised directly in ssr-streaming.test.ts).
 * Concatenating every chunk this Readable emits equals `renderToString(vnode)` exactly.
 */
export function renderToStream(vnode: VNode): ReadableType {
  // node:stream is imported dynamically (not statically at module top-level) so that this
  // module remains safe to include in a browser bundle -- mirroring the existing pattern
  // for optional Node-only capabilities in this package (reactivity/signals.ts's
  // async_hooks guard, runtime/adapters/node-adapter.ts's indirect dynamic import).
  // renderToStream itself is a server-only entry point (same contract as renderToString's
  // "no DOM environment" requirement, just inverted), so requiring it is only ever reached
  // when actually called from Node, never merely by importing this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Readable } = require("node:stream") as typeof import("node:stream");

  const iterator = renderToStringChunks(vnode);
  return new Readable({
    read() {
      const { value, done } = iterator.next();
      if (done) {
        this.push(null);
      } else {
        this.push(value);
      }
    },
  });
}

/**
 * Web Streams API entry point (edge runtimes, fetch-based servers). Same chunking and same
 * byte-for-byte parity with renderToString as renderToStream (Node) above -- both are thin
 * adapters over the same renderToStringChunks generator.
 */
export function renderToStreamWeb(vnode: VNode): ReadableStream<string> {
  const iterator = renderToStringChunks(vnode);
  return new ReadableStream<string>({
    pull(controller) {
      const { value, done } = iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value as string);
      }
    },
  });
}
