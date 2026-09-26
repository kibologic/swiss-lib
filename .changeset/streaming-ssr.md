---
"@swissjs/core": minor
"@swissjs/router": minor
---

Add streaming server-side rendering. `@swissjs/core` exports `renderToStream` (Node
`Readable`), `renderToStreamWeb` (Web `ReadableStream`), and `renderToStringChunks` (an
async generator yielding one chunk per top-level child of the root vnode instead of
buffering into one string), built as a second consumer of `renderToString`'s existing
per-vnode HTML generation -- `renderToString` itself is unchanged.

`@swissjs/router`'s `ServerRenderer` gains `renderStream(url)`, mirroring `render(url)`
(same route matching, loader data, `buildRouteTree` tree) but streaming the document shell
and component markup instead of buffering.

Parity: concatenating every chunk from `renderToStream`/`renderStream` equals the
corresponding `renderToString`/`render` output byte-for-byte for routes that do not call
`useHead()`/`setTitle()`/`addMeta()`/`addLink()` during render. Known, documented gap:
`renderStream()` flushes its shell (including `<title>`) before any component executes, so
it does not reflect per-request head customization the way `render()` does -- see
`router/src/ssr/server-renderer.ts`'s `renderStream()` doc comment ("KNOWN GAP against
HEAD-001") and the pinning test in `router/tests/ssr-stream.test.ts`. Do not route a page
that depends on `useHead()` through `renderStream()` until a deferred/two-pass head design
lands.
