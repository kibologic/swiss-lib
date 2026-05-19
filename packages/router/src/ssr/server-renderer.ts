import { Router, type Route, type RouteMatch } from "../core/router.js";
import { createElement, renderToString } from "@kibologic/core";
import type { VNode } from "@kibologic/core";

export interface SSRContext {
  url: string;
  data?: Record<string, any>;
}

export interface SSRResult {
  html: string;
  data: Record<string, any>;
  statusCode: number;
  redirect?: string;
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
    const componentHtml = renderToString(buildRouteTree(matches, data));

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

    return { html, data, statusCode: 200 };
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
function buildRouteTree(matches: RouteMatch[], data: Record<string, any>): VNode {
  // Innermost first: start with the leaf component
  let tree: VNode = buildComponentVNode(matches[matches.length - 1], data);

  // Walk inward → outward, wrapping each layer's layout if present
  for (let i = matches.length - 2; i >= 0; i--) {
    const match = matches[i];
    if (match.route.layout) {
      const props = mergeProps(match, data);
      tree = createElement(match.route.layout, { ...props, children: [tree] }) as VNode;
    }
  }

  // Wrap the entire tree in the leaf route's layout if it has one
  // (leaf layout wraps only the leaf, already handled above for parents)
  // Note: leaf layout was NOT applied above — apply it now as the immediate wrapper
  const leafMatch = matches[matches.length - 1];
  if (leafMatch.route.layout && matches.length >= 1) {
    // Leaf layout is the tightest wrapper around the leaf content (already in tree)
    // We rebuild: leaf layout wraps just the leaf component
    const leafProps = mergeProps(leafMatch, data);
    const leafComponent = buildComponentVNode(leafMatch, data);
    tree = createElement(leafMatch.route.layout, { ...leafProps, children: [leafComponent] }) as VNode;

    // Then outer layouts wrap that
    for (let i = matches.length - 2; i >= 0; i--) {
      const match = matches[i];
      if (match.route.layout) {
        const props = mergeProps(match, data);
        tree = createElement(match.route.layout, { ...props, children: [tree] }) as VNode;
      }
    }
  }

  return tree;
}

function buildComponentVNode(match: RouteMatch, data: Record<string, any>): VNode {
  const props = mergeProps(match, data);
  return createElement(match.route.component, props) as VNode;
}

function mergeProps(match: RouteMatch, data: Record<string, any>): Record<string, unknown> {
  const loaderData = data[match.route.path] ?? {};
  return { ...match.params, ...loaderData };
}

export function createServerRenderer(router: Router): ServerRenderer {
  return new ServerRenderer(router);
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
