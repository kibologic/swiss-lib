import { Router, type RouteMatch } from "../core/router.js";
import { createElement, renderToString } from "@kibologic/core";

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
    const leafMatch: RouteMatch = matches[matches.length - 1];
    const Component = leafMatch.route.component;

    // Render the component tree to an HTML string
    const vnode = createElement(Component, { ...leafMatch.params, ...data[leafMatch.route.path] });
    const componentHtml = renderToString(vnode);

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

export function createServerRenderer(router: Router): ServerRenderer {
  return new ServerRenderer(router);
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
