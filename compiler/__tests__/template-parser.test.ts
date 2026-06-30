/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from "vitest";
import { parseTemplate } from "../src/template-parser";
import type { TemplateNode } from "../src/template-parser";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstChild(nodes: TemplateNode[], kind?: string): TemplateNode | undefined {
  return kind ? nodes.find((n) => n.kind === kind) : nodes[0];
}

// ─── Element parsing ─────────────────────────────────────────────────────────

describe("parseTemplate — element parsing", () => {
  it("parses a simple element", () => {
    const ast = parseTemplate('<div class="foo">Hello</div>');
    const el = firstChild(ast.root.children, "element")!;
    expect(el.tag).toBe("div");
    expect(el.props["class"]).toEqual({ kind: "static", value: "foo" });
    expect(el.children[0]).toMatchObject({ kind: "text", text: "Hello" });
    expect(ast.errors).toHaveLength(0);
  });

  it("parses a self-closing element", () => {
    const ast = parseTemplate('<img src="logo.png" />');
    const el = firstChild(ast.root.children, "element")!;
    expect(el.tag).toBe("img");
    expect(el.selfClosing).toBe(true);
    expect(el.children).toHaveLength(0);
  });

  it("parses nested elements", () => {
    const ast = parseTemplate('<ul><li>Item 1</li><li>Item 2</li></ul>');
    const ul = firstChild(ast.root.children, "element")!;
    expect(ul.tag).toBe("ul");
    expect(ul.children).toHaveLength(2);
    expect(ul.children[0]).toMatchObject({ kind: "element", tag: "li" });
  });

  it("parses boolean attributes", () => {
    const ast = parseTemplate("<input disabled />");
    const el = firstChild(ast.root.children, "element")!;
    expect(el.props["disabled"]).toEqual({ kind: "boolean" });
  });
});

// ─── Component parsing ───────────────────────────────────────────────────────

describe("parseTemplate — component parsing", () => {
  it("identifies capitalized tags as components", () => {
    const ast = parseTemplate('<MyButton label="Click" />');
    const node = firstChild(ast.root.children, "component")!;
    expect(node.kind).toBe("component");
    expect(node.tag).toBe("MyButton");
    expect(node.props["label"]).toEqual({ kind: "static", value: "Click" });
  });

  it("parses component children", () => {
    const ast = parseTemplate("<Card><span>Content</span></Card>");
    const card = firstChild(ast.root.children, "component")!;
    expect(card.tag).toBe("Card");
    expect(card.children[0]).toMatchObject({ kind: "element", tag: "span" });
  });
});

// ─── Expression parsing ──────────────────────────────────────────────────────

describe("parseTemplate — expression parsing", () => {
  it("parses inline expressions", () => {
    const ast = parseTemplate("<div>{this.count}</div>");
    const div = firstChild(ast.root.children, "element")!;
    const expr = firstChild(div.children, "expression")!;
    expect(expr.expression).toBe("this.count");
  });

  it("parses expression props", () => {
    const ast = parseTemplate('<div class={styles.active}>x</div>');
    const div = firstChild(ast.root.children, "element")!;
    expect(div.props["class"]).toEqual({ kind: "expression", value: "styles.active" });
  });

  it("handles nested braces in expressions", () => {
    const ast = parseTemplate("<div>{items.map(x => ({ id: x.id }))}</div>");
    const div = firstChild(ast.root.children, "element")!;
    const expr = firstChild(div.children, "expression")!;
    expect(expr.expression).toContain("items.map");
    expect(ast.errors).toHaveLength(0);
  });
});

// ─── Slot parsing ────────────────────────────────────────────────────────────

describe("parseTemplate — slot parsing", () => {
  it("identifies default slot", () => {
    const ast = parseTemplate("<slot />");
    expect(ast.slots).toContain("default");
    const slot = firstChild(ast.root.children, "slot")!;
    expect(slot.kind).toBe("slot");
  });

  it("identifies named slots", () => {
    const ast = parseTemplate('<slot name="header" /><slot name="footer" />');
    expect(ast.slots).toContain("header");
    expect(ast.slots).toContain("footer");
    expect(ast.slots).not.toContain("default");
  });

  it("deduplicates slot names", () => {
    const ast = parseTemplate('<slot name="header" /><slot name="header" />');
    expect(ast.slots.filter((s) => s === "header")).toHaveLength(1);
  });
});

// ─── Fragment parsing ────────────────────────────────────────────────────────

describe("parseTemplate — fragment parsing", () => {
  it("parses fragment shorthand", () => {
    const ast = parseTemplate("<><span>A</span><span>B</span></>");
    const frag = firstChild(ast.root.children, "fragment")!;
    expect(frag.kind).toBe("fragment");
    expect(frag.children).toHaveLength(2);
  });
});

// ─── Comment parsing ─────────────────────────────────────────────────────────

describe("parseTemplate — comment parsing", () => {
  it("parses HTML comments", () => {
    const ast = parseTemplate("<!-- section header --><div>x</div>");
    const comment = firstChild(ast.root.children, "comment")!;
    expect(comment.kind).toBe("comment");
    expect(comment.text).toBe("section header");
  });
});

// ─── Error recovery ──────────────────────────────────────────────────────────

describe("parseTemplate — error recovery", () => {
  it("records error for mismatched closing tag", () => {
    const ast = parseTemplate("<div></span>");
    expect(ast.errors.length).toBeGreaterThan(0);
    expect(ast.errors[0].message).toMatch(/span/);
  });

  it("reports unclosed tags", () => {
    const ast = parseTemplate("<div class='foo'");
    expect(ast.errors.length).toBeGreaterThan(0);
  });
});

// ─── Position info ───────────────────────────────────────────────────────────

describe("parseTemplate — position tracking", () => {
  it("records start offset for each node", () => {
    const src = "<div>text</div>";
    const ast = parseTemplate(src);
    const el = firstChild(ast.root.children, "element")!;
    expect(el.start.offset).toBe(0);
    expect(el.start.line).toBe(1);
  });

  it("tracks line numbers across newlines", () => {
    const src = "<div>\n  <span>x</span>\n</div>";
    const ast = parseTemplate(src);
    const div = firstChild(ast.root.children, "element")!;
    const span = firstChild(div.children, "element")!;
    expect(span.start.line).toBeGreaterThan(1);
  });
});

// ─── Source preserved ────────────────────────────────────────────────────────

describe("parseTemplate — TemplateAST shape", () => {
  it("preserves original source on the AST", () => {
    const src = "<div>hello</div>";
    const ast = parseTemplate(src);
    expect(ast.source).toBe(src);
  });

  it("root node is always a fragment", () => {
    const ast = parseTemplate("<div /><span />");
    expect(ast.root.kind).toBe("fragment");
    expect(ast.root.children).toHaveLength(2);
  });
});
