/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from "vitest";
import { UiCompiler } from "../src/index";

// COMP-001: the compiler's SwissComponent import injection lived only in
// swissSyntaxTransformer() (the Phase 2 AST pass in swiss-syntax.ts), gated
// on `!hasClassWrapper`. UiCompiler.compileAsync() -- the real production
// entry point, used exclusively by swite's dev server and build engine --
// never calls that Phase 2 pass at all. It only calls preprocessSwissSyntax()
// (Phase 1, lexical). So for `component X {}` files, which Phase 1 rewrites
// to `class X extends SwissComponent {}` directly, nothing in the production
// path ever adds the `import { SwissComponent } from '@swissjs/core'` --
// the emitted module references SwissComponent as a free identifier.
describe("COMP-001: SwissComponent import injection", () => {
  it("injects the SwissComponent import for `component X {}` syntax with no hand-written import", async () => {
    const source = `component Counter {\n  render() { return null; }\n}\n`;

    const compiler = new UiCompiler();
    const out = await compiler.compileAsync(source, "Counter.uix");

    // The emitted class still extends SwissComponent...
    expect(out).toMatch(/class\s+Counter\s+extends\s+SwissComponent/);
    // ...and now the import must actually be present, or SwissComponent is a
    // free identifier at runtime (ReferenceError: SwissComponent is not defined).
    expect(out).toMatch(
      /import\s*\{[^}]*\bSwissComponent\b[^}]*\}\s*from\s*['"]@swissjs\/core['"]/,
    );
  });

  it("still injects the SwissComponent import for the bare-.uix path (no `component` keyword, no class wrapper)", async () => {
    // This is the case the original `!hasClassWrapper` guard was written
    // for: a bodiless .uix file gets wrapped in
    // `export default class extends SwissComponent { ... }`, and the import
    // must be added since there was no class wrapper (and no SwissComponent
    // reference) in the source at all.
    const source = `render() { return null; }\n`;

    const compiler = new UiCompiler();
    const out = await compiler.compileAsync(source, "Bare.uix");

    expect(out).toMatch(/class[^{]*extends\s+SwissComponent/);
    expect(out).toMatch(
      /import\s*\{[^}]*\bSwissComponent\b[^}]*\}\s*from\s*['"]@swissjs\/core['"]/,
    );
  });
});
