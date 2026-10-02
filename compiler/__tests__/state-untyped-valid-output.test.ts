/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// COMPILER-002: `state { let x = v; }` (no type annotation) used to be emitted
// as a raw `{ let x = v; }` block inside the class body, which is invalid
// TypeScript. These tests run the compiler output through esbuild (the same
// second step swite performs) so "compiles but emits invalid code" cannot recur.

import { describe, it, expect } from "vitest";
import { transform } from "esbuild";
import { preprocessSwissSyntax } from "../src/transformers/swiss-syntax";

function wrap(stateBody: string): string {
  return `import { SwissComponent } from '@swissjs/core';
component Foo {
  state { ${stateBody} }
}
`;
}

async function assertParses(code: string): Promise<void> {
  await expect(transform(code, { loader: "ts", format: "esm" })).resolves.toBeDefined();
}

describe("untyped state declarations emit valid, reactive code (COMPILER-002)", () => {
  const fixtures: Array<[string, string]> = [
    ["boolean literal", "let narrow = false;"],
    ["multiple declarators", "let a = 1, b = 'x';"],
    ["empty array", "let c = [];"],
    ["empty object", "let d = {};"],
    ["object with nested braces", "let e = { k: { z: true } };"],
    ["initializer containing a comma in a string", "let f = 'a, b';"],
    ["no initializer", "let g;"],
    ["mixed typed and untyped", "let h: number = 1; let i = 2; let j: string[] = [];"],
  ];

  for (const [label, body] of fixtures) {
    it(`parses: ${label}`, async () => {
      const out = preprocessSwissSyntax(wrap(body), "Foo.uix");
      await assertParses(out);
    });
  }

  it("untyped state is Signal-backed with getter and setter", () => {
    const out = preprocessSwissSyntax(wrap("let narrow = false;"), "Foo.uix");
    expect(out).toContain("private _narrow$ = new Signal(false);");
    expect(out).toContain("private get narrow() { return this._narrow$.value; }");
    expect(out).toContain("private set narrow(v)");
    expect(out).not.toMatch(/\{\s*let narrow/);
  });

  it("splits multiple declarators into separate signals", () => {
    const out = preprocessSwissSyntax(wrap("let a = 1, b = 'x';"), "Foo.uix");
    expect(out).toContain("new Signal(1)");
    expect(out).toContain("new Signal('x')");
  });

  it("raises a clear error naming file:line for an unparseable state declaration", () => {
    const src = wrap("const x = 1;");
    expect(() => preprocessSwissSyntax(src, "Foo.uix")).toThrow(/Foo\.uix:3.*SWISS_002/s);
  });
});
