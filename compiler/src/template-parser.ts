/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type TemplateNodeKind =
  | "element"     // <div>, <span>, etc.
  | "component"   // <MyComp> (capitalized tag)
  | "text"        // plain text content
  | "expression"  // {expr}
  | "slot"        // <slot name="x" />
  | "fragment"    // <>...</>
  | "comment";    // <!-- ... -->

export interface Position {
  offset: number;
  line: number;
  column: number;
}

export type TemplatePropValue =
  | { kind: "static"; value: string }
  | { kind: "expression"; value: string }
  | { kind: "boolean" };

export interface TemplateNode {
  kind: TemplateNodeKind;
  tag?: string;
  props: Record<string, TemplatePropValue>;
  children: TemplateNode[];
  expression?: string;
  text?: string;
  start: Position;
  end: Position;
  selfClosing?: boolean;
  unclosed?: boolean;
}

export interface TemplateParseError {
  message: string;
  start: Position;
  end: Position;
}

export interface TemplateAST {
  root: TemplateNode;
  slots: string[];
  errors: TemplateParseError[];
  source: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class TemplateParser {
  private pos = 0;
  private line = 1;
  private col = 1;
  private readonly errors: TemplateParseError[] = [];
  private readonly slots: string[] = [];

  constructor(private readonly src: string) {}

  parse(): TemplateAST {
    const start = this.position();
    const children = this.parseChildren(null);
    const root: TemplateNode = { kind: "fragment", props: {}, children, start, end: this.position() };
    return { root, slots: this.slots, errors: this.errors, source: this.src };
  }

  private position(): Position {
    return { offset: this.pos, line: this.line, column: this.col };
  }

  private ch(): string | null {
    return this.pos < this.src.length ? this.src[this.pos] : null;
  }

  private peek(offset = 1): string | null {
    const i = this.pos + offset;
    return i < this.src.length ? this.src[i] : null;
  }

  private advance(): void {
    if (this.pos >= this.src.length) return;
    if (this.src[this.pos] === "\n") { this.line++; this.col = 1; }
    else { this.col++; }
    this.pos++;
  }

  private skip(n: number): void {
    for (let i = 0; i < n; i++) this.advance();
  }

  private skipWhitespace(): void {
    while (this.ch() !== null && /\s/.test(this.ch()!)) this.advance();
  }

  private readIdentifier(): string {
    let id = "";
    const first = this.ch();
    if (first !== null && /[a-zA-Z_$]/.test(first)) {
      id += first; this.advance();
      while (this.ch() !== null && /[a-zA-Z0-9_$.-]/.test(this.ch()!)) {
        id += this.ch(); this.advance();
      }
    }
    return id;
  }

  private readExpression(): string {
    let expr = "";
    let depth = 1;
    this.advance(); // skip opening {
    while (this.ch() !== null) {
      const c = this.ch()!;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { this.advance(); break; } }
      expr += c;
      this.advance();
    }
    return expr.trim();
  }

  private readAttrValue(): TemplatePropValue {
    const q = this.ch();
    if (q === '"' || q === "'") {
      this.advance();
      let val = "";
      while (this.ch() !== null && this.ch() !== q) { val += this.ch(); this.advance(); }
      if (this.ch() === q) this.advance();
      return { kind: "static", value: val };
    }
    if (this.ch() === "{") {
      const expr = this.readExpression();
      return { kind: "expression", value: expr };
    }
    return { kind: "boolean" };
  }

  private parseProps(): Record<string, TemplatePropValue> {
    const props: Record<string, TemplatePropValue> = {};
    while (true) {
      this.skipWhitespace();
      const c = this.ch();
      if (c === null || c === ">" || (c === "/" && this.peek() === ">")) break;
      if (c === "{") {
        const expr = this.readExpression();
        props[`__spread_${Object.keys(props).length}`] = { kind: "expression", value: expr };
        continue;
      }
      if (!/[a-zA-Z_$@:]/.test(c)) { this.advance(); continue; }
      const name = this.readIdentifier();
      if (!name) { this.advance(); continue; }
      this.skipWhitespace();
      if (this.ch() === "=") { this.advance(); props[name] = this.readAttrValue(); }
      else { props[name] = { kind: "boolean" }; }
    }
    return props;
  }

  private parseChildren(parentTag: string | null): TemplateNode[] {
    const nodes: TemplateNode[] = [];
    while (this.ch() !== null) {
      const c = this.ch()!;
      // Closing tag check
      if (c === "<" && this.peek() === "/") {
        if (parentTag === null) break;
        // Consume </tagName>
        this.skip(2);
        const closingTag = this.readIdentifier();
        this.skipWhitespace();
        if (this.ch() === ">") this.advance();
        if (closingTag !== parentTag) {
          this.errors.push({ message: `Unexpected closing tag </${closingTag}>, expected </${parentTag}>`, start: this.position(), end: this.position() });
        }
        break;
      }
      if (c === "<" && this.peek() === "!") {
        const node = this.parseComment();
        if (node) nodes.push(node);
        continue;
      }
      if (c === "<" && this.peek() === ">") {
        const node = this.parseFragment();
        if (node) nodes.push(node);
        continue;
      }
      if (c === "<" && this.peek() !== null && /[a-zA-Z_$]/.test(this.peek()!)) {
        const node = this.parseElement();
        if (node) nodes.push(node);
        continue;
      }
      if (c === "{") {
        const node = this.parseExpression();
        if (node) nodes.push(node);
        continue;
      }
      const node = this.parseText();
      if (node) nodes.push(node);
    }
    return nodes;
  }

  private parseElement(): TemplateNode | null {
    const start = this.position();
    this.advance(); // skip <
    const tag = this.readIdentifier();
    if (!tag) return null;

    const kind: TemplateNodeKind =
      tag === "slot" ? "slot" : /^[A-Z]/.test(tag) ? "component" : "element";

    const props = this.parseProps();
    this.skipWhitespace();

    let selfClosing = false;
    if (this.ch() === "/" && this.peek() === ">") {
      selfClosing = true;
      this.skip(2);
    } else if (this.ch() === ">") {
      this.advance();
    } else {
      this.errors.push({ message: `Unclosed opening tag <${tag}>`, start, end: this.position() });
      return { kind, tag, props, children: [], start, end: this.position(), selfClosing: true, unclosed: true };
    }

    if (kind === "slot") {
      const slotName = props["name"]?.kind === "static" ? props["name"].value : "default";
      if (!this.slots.includes(slotName)) this.slots.push(slotName);
    }

    if (selfClosing) {
      return { kind, tag, props, children: [], start, end: this.position(), selfClosing: true };
    }

    const children = this.parseChildren(tag);
    return { kind, tag, props, children, start, end: this.position() };
  }

  private parseFragment(): TemplateNode {
    const start = this.position();
    this.skip(2); // skip <>
    const children = this.parseChildren(null);
    // consume closing </>
    if (this.ch() === "<" && this.peek() === "/") {
      this.skip(2);
      if (this.ch() === ">") this.advance();
    }
    return { kind: "fragment", tag: undefined, props: {}, children, start, end: this.position() };
  }

  private parseComment(): TemplateNode | null {
    const start = this.position();
    if (this.src.slice(this.pos, this.pos + 4) !== "<!--") return null;
    this.skip(4);
    let text = "";
    while (this.ch() !== null) {
      if (this.src.slice(this.pos, this.pos + 3) === "-->") { this.skip(3); break; }
      text += this.ch(); this.advance();
    }
    return { kind: "comment", props: {}, children: [], text: text.trim(), start, end: this.position() };
  }

  private parseExpression(): TemplateNode {
    const start = this.position();
    const expr = this.readExpression();
    return { kind: "expression", props: {}, children: [], expression: expr, start, end: this.position() };
  }

  private parseText(): TemplateNode | null {
    const start = this.position();
    let text = "";
    while (this.ch() !== null && this.ch() !== "<" && this.ch() !== "{") {
      text += this.ch(); this.advance();
    }
    const trimmed = text.trim();
    if (!trimmed) return null;
    return { kind: "text", props: {}, children: [], text: trimmed, start, end: this.position() };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a SwissJS template (JSX content from a render method or .uix file)
 * into a TemplateAST.
 *
 * The source may be the full content of a .ui/.uix file, or just the JSX
 * portion extracted from a render() method body. The parser does not
 * transform the source — that is the compiler pipeline's responsibility.
 */
export function parseTemplate(source: string): TemplateAST {
  return new TemplateParser(source).parse();
}
