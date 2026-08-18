/* Copyright (c) 2024 Themba Mzumara — SwissJS Framework. MIT License. */
// HEAD-001: client-side apply-to-document.head path. Split into its own file (rather than
// a second describe block in head-management.test.ts) because vitest's `@vitest-environment`
// pragma is file-scoped, not block-scoped -- putting it mid-file would silently switch the
// whole file (including the "no document global" SSR tests) to jsdom.
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { useHead, setTitle, addMeta, addLink } from "../head/index.js";

describe("HEAD-001: client apply to document.head", () => {
  it("setTitle updates document.title directly when there is no active context", () => {
    setTitle("Client Title");
    expect(document.title).toBe("Client Title");
  });

  it("addMeta upserts a meta tag by name, overriding on repeat calls", () => {
    addMeta({ name: "description", content: "first" });
    addMeta({ name: "description", content: "second" });
    const tags = document.head.querySelectorAll('meta[name="description"]');
    expect(tags).toHaveLength(1);
    expect(tags[0].getAttribute("content")).toBe("second");
  });

  it("addLink upserts a link tag by rel+href", () => {
    addLink({ rel: "canonical", href: "https://client.example/a" });
    addLink({ rel: "canonical", href: "https://client.example/a" });
    const tags = document.head.querySelectorAll(
      'link[rel="canonical"][href="https://client.example/a"]',
    );
    expect(tags).toHaveLength(1);
  });

  it("useHead applies htmlAttrs/bodyAttrs to documentElement/body", () => {
    useHead({ htmlAttrs: { lang: "fr" }, bodyAttrs: { class: "themed" } });
    expect(document.documentElement.getAttribute("lang")).toBe("fr");
    expect(document.body.getAttribute("class")).toBe("themed");
  });
});
