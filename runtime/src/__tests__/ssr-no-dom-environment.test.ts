/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// This file deliberately carries no jsdom environment pragma of any kind -- it must run
// under this package's actual default (plain 'node', see vitest.config.ts) to mean
// anything. A real SSR deployment (a Node HTTP server rendering a response) has no
// `document` global unless something goes out of its way to install one; a passing test
// here is what "SSR works outside a browser-shaped test harness" actually requires.
// (Do not write the literal at-sign-vitest-environment-jsdom pragma string anywhere in
// this file, even in prose -- vitest's pragma scanner matches it wherever it appears in
// the leading comments, not just as a directive, and will silently switch this file to
// jsdom, defeating the entire point of the file.)
import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { renderToString } from "../renderer/renderer.js";
import { SwissComponent } from "../component/component.js";
import { jsx } from "../vdom/vdom.js";

describe("renderToString in a genuinely DOM-less environment", () => {
  it("sanity check: this test file really has no document/window global", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("constructs and renders a real SwissComponent without throwing", () => {
    class Greeting extends SwissComponent {
      render() {
        return jsx("p", { children: `hello, ${(this.props as { name?: string }).name}` });
      }
    }

    // Before the fix: SwissComponent's constructor unconditionally called
    // document.createElement("div") (component.ts), so `new Greeting(...)` itself threw
    // "document is not defined" here -- renderToString's component branch wraps that in
    // its own try/catch and returns "" (renderer.ts), so the failure was invisible unless
    // you inspected the html string's actual content, which no existing test did (see
    // router/tests/ssr.test.ts's stub `{ name: 'X' }` components -- never real classes).
    const html = renderToString(jsx(Greeting, { name: "world" }));

    expect(html).toBe("<p>hello, world</p>");
  });

  it("renders nested real components (the shape router's ServerRenderer actually builds)", () => {
    class Layout extends SwissComponent {
      render() {
        return jsx("div", { class: "layout", children: this.props.children as never });
      }
    }
    class Page extends SwissComponent {
      render() {
        return jsx(Layout, {
          children: jsx("span", { children: (this.props as { title?: string }).title }),
        });
      }
    }

    const html = renderToString(jsx(Page, { title: "Docs" }));

    expect(html).toBe('<div class="layout"><span>Docs</span></div>');
  });

  it("renders a pure pass-through component (one component's render() returns another) without recursing forever", () => {
    // The sharpest form of the bug the previous test's Layout/Page pair also exercises,
    // isolated: a component whose render() returns ANOTHER component vnode directly, with
    // no wrapping element of its own. This is an ordinary pattern (redirects, thin routing
    // wrappers, context/guard components) and it is exactly router's own ServerRenderer
    // shape when a route match has no layout at some level (buildRouteTree only wraps a
    // match in an element if `match.route.layout` is set -- server-renderer.ts).
    //
    // Before the fix: renderComponentImpl (component-rendering.ts) unconditionally tags
    // whatever a component's render() returns with `__componentInstance = <that
    // component's own instance>` -- correct when the return value is a leaf element, wrong
    // here, where the return value is ITSELF a component vnode for `Inner`. The recursive
    // renderToString() call trusted that tag as `Inner`'s existingInstance, so it re-ran
    // `Outer`'s instance's render() again believing it was rendering `Inner` -- forever.
    // This did not throw visibly: renderToString's try/catch (this same file, above the
    // component branch) caught the eventual RangeError and returned "" silently.
    class Inner extends SwissComponent {
      render() {
        return jsx("span", { children: "leaf" });
      }
    }
    class Outer extends SwissComponent {
      render() {
        return jsx(Inner, {});
      }
    }

    const html = renderToString(jsx(Outer, {}));

    expect(html).toBe("<span>leaf</span>");
  });
});

describe("SSR-002: renderToString component failures are visible, not silently empty", () => {
  it("a component that throws renders a detectable error-boundary marker, not an empty string", () => {
    class Boom extends SwissComponent {
      render() {
        throw new Error("kaboom");
      }
    }
    const html = renderToString(jsx(Boom, {}));
    expect(html).not.toBe("");
    expect(html).toContain('data-swiss-error-boundary="true"');
    expect(html).toContain("kaboom");
  });

  it("does not leak the raw stack trace outside NODE_ENV=development", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      class Boom extends SwissComponent {
        render() {
          throw new Error("kaboom");
        }
      }
      const html = renderToString(jsx(Boom, {}));
      expect(html).toContain("kaboom");
      // The stack trace names this test file's own path -- if that leaked, it would be in the
      // response body of a real production SSR page.
      expect(html).not.toContain("ssr-no-dom-environment.test.ts");
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
