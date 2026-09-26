/**
 * FIRST-CLASS CAPABILITY (FRAME-006, ratified 2026-07-21): SSR/hydration is BUILT and
 * TESTED, not experimental holding. Ratified consumers are PUBLIC surfaces -- the ASG
 * storefront, documentation, marketing, public commerce pages -- where SEO and first paint
 * genuinely matter. See router/tests/ssr.test.ts (server-renderer, incl. real-component and
 * layout-nesting coverage) and runtime/src/__tests__/ssr-*.test.ts (round-trip hydration,
 * no-DOM-environment construction).
 *
 * HYDRATION CORRECTNESS VALIDATION IS GATED ON FRAME-001, still. Hydration matches
 * server-rendered HTML to client vnodes by node identity, which today is
 * runtime-index-derived rather than stable across conditional/list-length differences
 * between server and client renders. This is BUILT and PARTIALLY TESTED -- the happy path
 * (matching server/client render) round-trips correctly and restores reactivity/event
 * handlers; a genuine tag mismatch is caught and recovered without leaking stale instance
 * state (runtime/src/renderer/hydration.ts). What is NOT validated: silent
 * position-based misbinding when server and client structurally agree in shape (same tags)
 * but disagree in identity (e.g. a list item removed from the front) -- demonstrated,
 * reproducible, and deliberately left unfixed pending FRAME-001's stable-key/node-range
 * work (see runtime/src/__tests__/ssr-hydration-round-trip.test.ts's third test). Do not
 * claim general hydration correctness for arbitrary conditional/list content until then.
 */
import { Router, type Route, type RouteMatch } from "../core/router.js";
import { isLazyComponent } from "../core/lazy.js";
import {
  createElement,
  renderToString,
  renderToStringChunks,
  pushHeadContext,
  popHeadContext,
  renderHeadToString,
  htmlAttrsString,
  bodyAttrsString,
} from "@swissjs/core";
import type { VNode, ComponentType } from "@swissjs/core";

export interface SSRContext {
  url: string;
  data?: Record<string, unknown>;
}

export interface SSRResult {
  html: string;
  data: Record<string, unknown>;
  statusCode: number;
  redirect?: string;
  /** SSR-002: true when at least one component in this render threw and fell back to an
   *  error-boundary placeholder (runtime/src/renderer/errors.ts's createErrorBoundary).
   *  Absent (not `false`) on a render with no failures, so existing callers checking only
   *  `html`/`statusCode`/`data` see no shape change. */
  hadRenderErrors?: boolean;
}

/** SSR-002: the marker createErrorBoundary's fallback vnode always carries (runtime/src/
 *  renderer/errors.ts). renderToString's own catch and renderComponentImpl's internal catch
 *  both route through this same fallback (see renderer.ts's comment at its SSR catch site),
 *  so checking for this one string is sufficient regardless of which of the two caught the
 *  failure -- no structured-error channel needs threading through the shared client/server
 *  rendering path to answer "did anything fail" from the final HTML string alone. */
const ERROR_BOUNDARY_MARKER = 'data-swiss-error-boundary="true"';

/** SSR-002-style fallback for a lazy route whose dynamic import rejected (see
 *  buildComponentVNode's comment). Deliberately built with `createElement` + the same
 *  `data-swiss-error-boundary="true"` marker `ERROR_BOUNDARY_MARKER` checks for, rather
 *  than importing runtime's own `createErrorBoundary` -- the *public* `@swissjs/core`
 *  export of that name (error/error-boundary.ts) is a different, older implementation
 *  than the one renderToString/renderToStringChunks actually use internally for a
 *  throwing component (renderer/errors.ts, not re-exported), and does not carry this
 *  marker at all. Router has no access to the internal one, so it reproduces just the
 *  one thing ServerRenderer actually depends on -- the marker attribute -- rather than
 *  the rest of that internal component's presentation. */
function createLazyLoadErrorBoundary(message: string): VNode {
  return createElement(
    "div",
    { class: "swiss-router-lazy-error", "data-swiss-error-boundary": "true" },
    message,
  ) as VNode;
}

export class ServerRenderer {
  constructor(private router: Router) {}

  async render(url: string): Promise<SSRResult> {
    const matches = this.router.match(url);

    if (!matches || matches.length === 0) {
      return {
        html: "<!DOCTYPE html><html><body><h1>404 - Not Found</h1></body></html>",
        data: {},
        statusCode: 404,
      };
    }

    const data = await this.router.loadRouteData(url);

    // Build component tree from outermost layout to innermost leaf.
    // Each match may have a `layout` wrapper. We compose them inside-out:
    //   matches = [root, parent, leaf]
    //   tree = <RootLayout><ParentLayout><Leaf /></ParentLayout></RootLayout>
    //
    // HEAD-001: pushHeadContext()/popHeadContext() bracket the renderToString call so any
    // useHead()/setTitle()/addMeta()/addLink() call made synchronously from a component's
    // render() (which executes inside this same, fully synchronous renderToString call
    // stack -- see renderer.ts's renderToString) lands in THIS request's HeadContext, not a
    // module-global shared across requests. Because renderToString never awaits mid-render,
    // no other request's push/pop can interleave between this push and its matching pop
    // (pop runs in `finally`, so a throw from renderToString still leaves the stack clean).
    const tree = await buildRouteTree(matches, data);
    const headCtx = pushHeadContext();
    let componentHtml: string;
    try {
      componentHtml = renderToString(tree);
    } finally {
      popHeadContext();
    }
    const hadRenderErrors = componentHtml.includes(ERROR_BOUNDARY_MARKER);

    const safeData = JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    // Default the title (renderHeadToString only emits a <title> tag when one was set) so
    // the existing "Swiss App" default behavior is preserved for pages that never call
    // useHead()/setTitle().
    if (headCtx.title === undefined) headCtx.title = "Swiss App";
    const headHtml = renderHeadToString(headCtx);
    const htmlAttrs = htmlAttrsString(headCtx);
    const bodyAttrs = bodyAttrsString(headCtx);

    const html = `<!DOCTYPE html>
<html${htmlAttrs ? ` ${htmlAttrs}` : ""}>
  <head>
    <meta charset="utf-8" />
    ${headHtml}
  </head>
  <body${bodyAttrs ? ` ${bodyAttrs}` : ""}>
    <div id="app" data-swiss-route="${escapeAttr(url)}">${componentHtml}</div>
    <script>window.__SWISS_DATA__ = ${safeData};</script>
  </body>
</html>`;

    // SSR-002: never_touch forbids a failing widget taking the whole page down by default --
    // the requirement is that the failure becomes VISIBLE to the caller, not fatal. The HTML
    // still ships (the working parts of the page still render); the caller now has
    // statusCode + hadRenderErrors to decide what to do with a partially-failed render,
    // instead of an indistinguishable cheerful 200.
    return hadRenderErrors
      ? { html, data, statusCode: 500, hadRenderErrors: true }
      : { html, data, statusCode: 200 };
  }

  /**
   * Streaming counterpart to render(): same document, same route matching/data loading,
   * same buildRouteTree() component tree -- the only difference is the component markup
   * portion is produced by @swissjs/core's renderToStringChunks generator (chunked SSR,
   * runtime/src/renderer/ssr-stream.ts) instead of renderToString, and the whole document
   * is handed back as an async generator of string chunks instead of one buffered string.
   *
   * Parity contract: joining every chunk this yields for a given url produces EXACTLY the
   * same string render(url) would return as `.html` -- shell markup (doctype/head/body open
   * tag/app-div open tag), then the identical per-vnode chunks renderToStringChunks would
   * produce for buildRouteTree(matches, data), then the identical suffix (app-div close,
   * data script, body/html close) render() appends. No route-level markup is invented here;
   * this only changes accumulation into yields instead of `+=`, exactly as core's
   * renderToStream does for a bare component tree (see ssr-stream.ts's header comment).
   *
   * KNOWN GAP against HEAD-001 (document-head management, merged into `development` after
   * this branch was opened): the parity contract above holds ONLY for routes whose
   * components never call useHead()/setTitle()/addMeta()/addLink(). render() can honor
   * those calls because it fully buffers componentHtml (via renderToString) BEFORE
   * building headHtml/htmlAttrs/bodyAttrs from the populated HeadContext. renderStream()
   * cannot: the shell -- including <title> -- is yielded as the FIRST chunk, before
   * renderToStringChunks has executed a single component, by design (see "flushes the
   * document shell chunk before any component markup chunk" in ssr-stream.test.ts and the
   * matching comment in ssr-stream.ts). So renderStream() always emits the hard-coded
   * default shell (bare <head>, `<title>Swiss App</title>`, no htmlAttrs/bodyAttrs) and
   * silently ignores any useHead() call a streamed component makes -- it does NOT push/pop
   * a HeadContext around the chunk loop at all. This is deliberate, not an oversight: doing
   * so would require buffering the component tree to know its head contribution before the
   * shell can be flushed, which defeats the point of streaming. Do not route a page that
   * depends on per-request head customization through renderStream() until a deferred/
   * two-pass head design lands (candidate: flush an empty <head></head> and patch it via
   * a trailing <script> once head calls are known, matching how streaming frameworks
   * elsewhere solve this). See router/tests/ssr-stream.test.ts's
   * "does not reflect useHead()/setTitle() set during a streamed component's render" test,
   * which pins this divergence so it cannot regress silently in either direction.
   *
   * The 404 and route-data-loading steps happen before any chunk is yielded (matching
   * render()'s `await this.router.loadRouteData(url)` position), so -- unlike the component
   * markup itself -- routing/loader failures surface as a thrown error or an early
   * single-chunk 404 document, not a truncated stream.
   */
  async *renderStream(url: string): AsyncGenerator<string, void, void> {
    const matches = this.router.match(url);

    if (!matches || matches.length === 0) {
      yield "<!DOCTYPE html><html><body><h1>404 - Not Found</h1></body></html>";
      return;
    }

    const data = await this.router.loadRouteData(url);
    const tree = await buildRouteTree(matches, data);

    const safeData = JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    // Shell prefix: flushed before any component markup is rendered, same as core's
    // renderToStream flushing a root element's open tag before its children.
    yield `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Swiss App</title>
  </head>
  <body>
    <div id="app" data-swiss-route="${escapeAttr(url)}">`;

    for (const chunk of renderToStringChunks(tree)) {
      yield chunk;
    }

    yield `</div>
    <script>window.__SWISS_DATA__ = ${safeData};</script>
  </body>
</html>`;
  }
}

/**
 * Build a nested VNode tree that mirrors the matched route hierarchy.
 *
 * For route matches [root, parent, leaf]:
 *   - If `leaf.route.layout` exists, wrap leaf in its layout
 *   - Walk outward, each parent wrapping the inner tree
 *   - Root layout wraps everything
 *
 * Each component receives its matched params merged with loader data as props.
 *
 * ROUTER-LAZY-ROUTES x SSR: `match.route.component` may be a `LazyComponent` (see
 * core/lazy.ts's `lazy()`) rather than a plain `ComponentLike`. SSR is fully async already
 * (this function's caller always awaits it before the first `createElement` call), so it
 * resolves the loader here -- via `await component.load()` -- instead of the client
 * Outlet's synchronous-cache-plus-placeholder dance (outlet.ts's `ensureLazyLoadStarted`),
 * which exists only because a browser render() call cannot itself be async. There is no
 * pending/placeholder state to render server-side: the render call simply waits for the
 * one loader promise (memoized by `lazy()` itself, so awaiting it here never re-triggers
 * the dynamic import) and then builds the tree with the real, resolved component -- never
 * the `LazyComponent` wrapper object itself, which is not a valid `createElement` `type`
 * (it fails `isComponentVNode`'s `typeof vnode.type === "function"` check and silently
 * renders as empty markup, matching the FRAME-006 comment above for plain-object stubs).
 */
async function buildRouteTree(
  matches: RouteMatch[],
  data: Record<string, unknown>,
): Promise<VNode> {
  // Innermost first: start with the leaf component, then walk inward → outward wrapping
  // each layer's layout (including the leaf's own) around whatever has been built so far.
  //
  // FRAME-006: this used to pass the wrapped subtree as `{ ...props, children: [tree] }`
  // -- a props KEY -- to createElement(). createElement is createVNode (vdom.ts), whose
  // real signature is `(type, props, ...children)`: it only ever reads children from its
  // OWN rest arguments, never from props.children, and populates the vnode's `.children`
  // array field from those rest args alone. A layout wrapped this way got a vnode whose
  // `.children` field was permanently empty. Worse, renderComponentImpl
  // (component-rendering.ts) then OVERWRITES `props.children` on the instance from that
  // same empty `.children` field (`defaultChildren`) regardless of what the caller stuffed
  // into the original props object -- so the layout instance's `this.props.children` was
  // always `[]`, no matter what. Every layout-wrapped SSR route rendered its layout with
  // no content at all; router's own ssr.test.ts never caught this because its pre-existing
  // tests all registered `component: { name: 'X' }` plain objects, which fail
  // isComponentVNode's `typeof vnode.type === "function"` check and never actually
  // rendered through this path. Passing `tree` as a REST ARG (matching createVNode's real
  // signature) is the fix -- this also drops the function's old second pass, which existed
  // only to special-case "does the leaf have its own layout" and rebuilt the entire tree
  // from scratch to work around the same children-passing mistake once more.
  let tree: VNode = await buildComponentVNode(matches[matches.length - 1], data);

  const leafMatch = matches[matches.length - 1];
  if (leafMatch.route.layout) {
    const leafProps = mergeProps(leafMatch, data);
    tree = createElement(leafMatch.route.layout, leafProps, tree) as VNode;
  }

  for (let i = matches.length - 2; i >= 0; i--) {
    const match = matches[i];
    if (match.route.layout) {
      const props = mergeProps(match, data);
      tree = createElement(match.route.layout, props, tree) as VNode;
    }
  }

  return tree;
}

async function buildComponentVNode(
  match: RouteMatch,
  data: Record<string, unknown>,
): Promise<VNode> {
  const props = mergeProps(match, data);
  const component = await resolveComponent(match.route.component);
  // SSR-002: a lazy route whose dynamic import rejects (bad chunk, network failure, ...)
  // is a render failure like any other -- it must surface via the same error-boundary
  // marker a throwing component's render() produces (renderToString's/
  // renderToStringChunks' own catch sites), not crash the whole `render()`/`renderStream()`
  // call with an unhandled rejection. `resolveComponent` never throws for this reason; it
  // hands back the failure as a value instead.
  if (typeof component === "object" && "__lazyLoadError" in component) {
    const error = (component as { __lazyLoadError: unknown }).__lazyLoadError;
    const message = error instanceof Error ? error.message : String(error);
    return createLazyLoadErrorBoundary(`Lazy component failed to load: ${message}`);
  }
  return createElement(component, props) as VNode;
}

/** Resolve `route.component` to a real `ComponentLike`, awaiting the loader when it is a
 *  `LazyComponent` (see buildRouteTree's doc comment). A no-op for a plain component. A
 *  rejected loader is reported as `{ __lazyLoadError }` rather than thrown -- see
 *  buildComponentVNode's SSR-002 comment. */
async function resolveComponent(
  component: Route["component"],
): Promise<ComponentType | { __lazyLoadError: unknown }> {
  if (!isLazyComponent(component)) return component;
  try {
    return await component.load();
  } catch (error) {
    return { __lazyLoadError: error };
  }
}

function mergeProps(match: RouteMatch, data: Record<string, unknown>): Record<string, unknown> {
  const loaderData = (data[match.route.path] ?? {}) as Record<string, unknown>;
  return { ...match.params, ...loaderData };
}

export function createServerRenderer(router: Router): ServerRenderer {
  return new ServerRenderer(router);
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
