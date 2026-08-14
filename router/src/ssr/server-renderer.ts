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
import { createElement, renderToString } from "@swissjs/core";
import type { VNode } from "@swissjs/core";

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
    const componentHtml = renderToString(buildRouteTree(matches, data));
    const hadRenderErrors = componentHtml.includes(ERROR_BOUNDARY_MARKER);

    const safeData = JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Swiss App</title>
  </head>
  <body>
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
 */
function buildRouteTree(matches: RouteMatch[], data: Record<string, unknown>): VNode {
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
  let tree: VNode = buildComponentVNode(matches[matches.length - 1], data);

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

function buildComponentVNode(match: RouteMatch, data: Record<string, unknown>): VNode {
  const props = mergeProps(match, data);
  return createElement(match.route.component, props) as VNode;
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
