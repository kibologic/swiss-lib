/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// COMPILER-003: comments between declarations inside a `state {}` block.
// Before COMPILER-002 the declaration loop stopped at the first comment and silently DROPPED every
// declaration after it (they were never turned into Signal-backed state). COMPILER-002 turned that
// silent drop into a SWISS_002 error, which broke real components (office App.uix has `//` comments
// between its state fields). Comments are trivia: skip them and keep parsing.

import { describe, it, expect } from "vitest";
import { transform } from "esbuild";
import { preprocessSwissSyntax } from "../src/transformers/swiss-syntax";

function compile(stateBody: string): string {
  const src = `import { SwissComponent } from '@swissjs/core';
component Foo {
  state {
${stateBody}
  }
}
`;
  return preprocessSwissSyntax(src, "Foo.uix");
}

describe("comments inside a state {} block (COMPILER-003)", () => {
  it("line comments between declarations: every declaration becomes state", async () => {
    const out = compile(`    let a: number = 1;
    // a comment about b
    // spanning two lines
    let b: string[] = [];
    let c = false; // trailing comment
    let d: Record<string, unknown> | null = null;`);
    for (const name of ["a", "b", "c", "d"]) {
      expect(out).toContain(`_${name}$`);
    }
    await expect(transform(out, { loader: "ts", format: "esm" })).resolves.toBeDefined();
  });

  it("block comments between and before declarations", async () => {
    const out = compile(`    /* leading block comment */
    let a: number = 1;
    /* multi
       line */
    let b = 'x';`);
    expect(out).toContain("_a$");
    expect(out).toContain("_b$");
    await expect(transform(out, { loader: "ts", format: "esm" })).resolves.toBeDefined();
  });

  it("a comment containing a semicolon or 'let' does not break parsing", async () => {
    const out = compile(`    let a: number = 1;
    // let fake = 1; not a declaration
    let b: number = 2;`);
    expect(out).toContain("_a$");
    expect(out).toContain("_b$");
    expect(out).not.toContain("_fake$");
    await expect(transform(out, { loader: "ts", format: "esm" })).resolves.toBeDefined();
  });

  it("real junk after comments is still rejected with SWISS_002", () => {
    expect(() => compile(`    let a: number = 1;
    // fine
    console.log('not a declaration');`)).toThrow(/SWISS_002/);
  });
});
