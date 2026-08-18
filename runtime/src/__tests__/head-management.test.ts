/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// HEAD-001: document-head management. Plain 'node' default environment (no jsdom pragma) --
// most of this file exercises the SSR path, which must work with no `document` global at
// all. The one client-apply test opts into jsdom explicitly at its own describe block.
import { describe, it, expect } from "vitest";
import {
  useHead,
  setTitle,
  addMeta,
  addLink,
  collectHead,
  currentHeadContext,
  renderHeadToString,
  htmlAttrsString,
  bodyAttrsString,
} from "../head/index.js";

describe("HEAD-001: SSR head collection (no document global)", () => {
  it("has no document/window global in this file", () => {
    expect(typeof document).toBe("undefined");
  });

  it("useHead/setTitle is a no-op when there is no active context and no document", () => {
    expect(() => setTitle("ignored")).not.toThrow();
    expect(() => useHead({ meta: [{ name: "x", content: "y" }] })).not.toThrow();
    expect(currentHeadContext()).toBeUndefined();
  });

  it("title is last-writer-wins", () => {
    const ctx = collectHead(() => {
      setTitle("First");
      setTitle("Second");
    });
    expect(ctx.title).toBe("Second");
  });

  it("meta de-dupes and overrides by name", () => {
    const ctx = collectHead(() => {
      addMeta({ name: "description", content: "first" });
      addMeta({ name: "description", content: "second" });
    });
    expect(ctx.meta).toEqual([{ name: "description", content: "second" }]);
  });

  it("meta de-dupes and overrides by property, independently of name", () => {
    const ctx = collectHead(() => {
      addMeta({ property: "og:title", content: "first" });
      addMeta({ name: "description", content: "kept" });
      addMeta({ property: "og:title", content: "second" });
    });
    expect(ctx.meta).toEqual([
      { property: "og:title", content: "second" },
      { name: "description", content: "kept" },
    ]);
  });

  it("link de-dupes by rel+href, keeping distinct rels/hrefs separate", () => {
    const ctx = collectHead(() => {
      addLink({ rel: "canonical", href: "https://a.example/one" });
      addLink({ rel: "canonical", href: "https://a.example/one" });
      addLink({ rel: "canonical", href: "https://a.example/two" });
      addLink({ rel: "stylesheet", href: "https://a.example/one" });
    });
    expect(ctx.link).toHaveLength(3);
    expect(ctx.link).toContainEqual({ rel: "canonical", href: "https://a.example/two" });
    expect(ctx.link).toContainEqual({ rel: "stylesheet", href: "https://a.example/one" });
  });

  it("html/body attrs merge across multiple calls", () => {
    const ctx = collectHead(() => {
      useHead({ htmlAttrs: { lang: "en" }, bodyAttrs: { class: "dark" } });
      useHead({ htmlAttrs: { dir: "ltr" }, bodyAttrs: { "data-x": "1" } });
    });
    expect(htmlAttrsString(ctx)).toContain('lang="en"');
    expect(htmlAttrsString(ctx)).toContain('dir="ltr"');
    expect(bodyAttrsString(ctx)).toContain('class="dark"');
    expect(bodyAttrsString(ctx)).toContain('data-x="1"');
  });

  it("renderHeadToString emits title, meta, and link tags, escaped", () => {
    const ctx = collectHead(() => {
      setTitle('A & B <script>');
      addMeta({ name: "description", content: 'quote " here' });
      addLink({ rel: "canonical", href: "https://a.example/x" });
    });
    const html = renderHeadToString(ctx);
    expect(html).toContain("<title>A &amp; B &lt;script&gt;</title>");
    expect(html).toContain('<meta name="description" content="quote &quot; here" />');
    expect(html).toContain('<link rel="canonical" href="https://a.example/x" />');
  });

  it("two nested collectHead calls do not leak into each other (push/pop stack)", () => {
    const outer = collectHead(() => {
      setTitle("Outer");
      const inner = collectHead(() => {
        setTitle("Inner");
      });
      expect(inner.title).toBe("Inner");
    });
    expect(outer.title).toBe("Outer");
  });
});
