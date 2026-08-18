/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from "vitest";
import { preprocessSwissSyntax } from "../src/transformers/swiss-syntax";

// COMP-001: `component X {}` syntax is transformed to
// `class X extends SwissComponent {}` EARLIER in preprocessSwissSyntax (the
// component-keyword replace) than the bare-.uix `hasClassWrapper` guard runs.
// By the time that guard checks `!hasClassWrapper`, the class wrapper it is
// looking for already exists (created by the component-keyword transform,
// not by the guard's own bare-.uix wrapping branch) so the guard's body --
// the only place that injected the `SwissComponent` import -- never runs for
// this path. The emitted module references `SwissComponent` as a free
// identifier with no import, and crashes at runtime with
// "ReferenceError: SwissComponent is not defined" in a real browser.
//
// This is why every one of the 136 `component X {}` .uix files across
// alpine-ui/alpine-shell/alpine-core carries a hand-written
// `import { SwissComponent } from '@swissjs/core'` as a workaround -- without
// it, the file does not run.
describe("COMP-001: SwissComponent import injection for `component X {}` syntax", () => {
  it("injects the SwissComponent import for a `component X {}` file with NO hand-written import", () => {
    const source = `
component Counter {
  state { let count: number = 0; }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    // The emitted class extends SwissComponent (component-keyword transform).
    expect(result).toContain("class Counter extends SwissComponent");

    // It must import SwissComponent from somewhere -- this is the assertion
    // that fails RED against the current (broken) compiler.
    const hasSwissComponentImport =
      /\bimport\s*\{[^}]*\bSwissComponent\b[^}]*\}\s*from\s*['"]@swissjs\/core['"]/.test(
        result,
      );
    expect(hasSwissComponentImport).toBe(true);
  });

  it("does not double-import SwissComponent when the file already imports it by hand", () => {
    const source = `
import { SwissComponent } from '@swissjs/core';
component Counter {
  state { let count: number = 0; }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    const importCount = (
      result.match(
        /\bimport\s*\{[^}]*\bSwissComponent\b[^}]*\}\s*from\s*['"]@swissjs\/core['"]/g,
      ) || []
    ).length;
    expect(importCount).toBe(1);
  });

  it("augments an existing @swissjs/core import (for another symbol) with SwissComponent, rather than adding a second import line", () => {
    const source = `
import { Signal } from '@swissjs/core';
component Counter {
  mount { console.log('hi'); }
}
`;
    const result = preprocessSwissSyntax(source, "Counter.uix");

    const coreImportLines = result
      .split("\n")
      .filter((l) => l.includes("from '@swissjs/core'"));
    expect(coreImportLines.length).toBe(1);
    expect(coreImportLines[0]).toContain("SwissComponent");
    expect(coreImportLines[0]).toContain("Signal");
  });

  it("bare .uix file (no `component` keyword) still gets exactly one SwissComponent import via the existing wrap path", () => {
    const source = `
export let name: string = 'world';

mount {
  console.log('mounted');
}
`;
    const result = preprocessSwissSyntax(source, "Bare.uix");

    // Still wrapped in the anonymous default-export class as before.
    expect(result).toContain("export default class extends SwissComponent {");

    const importCount = (
      result.match(
        /\bimport\s*\{[^}]*\bSwissComponent\b[^}]*\}\s*from\s*['"]@swissjs\/core['"]/g,
      ) || []
    ).length;
    expect(importCount).toBe(1);
  });
});
