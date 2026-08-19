/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * FRAME-001 Stage 0 -- compiler-level companion to the runtime it.fails() red
 * case at runtime/__tests__/regression/null-child-and-list-reorder.test.ts:151.
 *
 * That runtime test documents the identity gap by hand-constructing vnode
 * trees directly via h() (createElement) -- it never goes through the real
 * compile pipeline. Per docs/FRAME-001-design-proposal.md §1.6, that means
 * flipping the runtime test to pass (once Stage 1 lands) would only prove
 * the RUNTIME's fallback logic can consume a stable key -- not that the
 * COMPILER actually emits one for real .uix source. This file closes that
 * gap by compiling real .uix source through the actual production pipeline
 * (UiCompiler#compile -> compileAsync, per compiler/src/compiler.ts:47-56)
 * and asserting on the emitted createElement(...) call shape itself.
 *
 * Shape, matching the runtime red case: three static (not looped) sibling
 * JSX <div> literals, the middle one wrapping an <input>. Per the design
 * doc §2.2, source-position identity is per-LITERAL: each of the three
 * div JSX nodes has its own fixed source position no matter which runtime
 * order a caller picks between them. This test models the "reordered"
 * half of the scenario the same way real .uix code would express it --
 * NOT by writing the same JSX twice at different source positions (which
 * would defeat the point: two different literals trivially get two
 * different positions), but with a single render() whose three div
 * literals are assigned once and then selected into different array
 * orders at runtime via a condition -- exactly §2.3's "conditional
 * sibling" case. The compiled output therefore contains exactly ONE
 * createElement("div", ...) call per literal; per §2.2, Stage 1 would
 * annotate each with a stable `key` derived from that literal's own
 * source position (`${relativeFilePath}:${line}:${column}`), which is
 * what makes reordering the array at runtime harmless to identity.
 *
 * There is no Stage 1 key-emission pass yet (compiler/src/compiler.ts's
 * compileAsync runs processImports -> transformJsxWithEsbuild with no
 * AST pre-pass in between, per §2.2's own description of where the new
 * pass would be inserted) -- so this test's assertion, that the div
 * wrapping the <input> carries a `key` prop in its compiled
 * createElement(...) call, does NOT hold today. It is intentionally
 * marked it.fails(), same convention as the runtime red case: it exists
 * to give Stage 1 a concrete, compiler-output-level target to compile
 * against, not to pass today. Reasoned from swiss-lib's own pipeline
 * (compiler/src/compiler.ts, compiler/src/index.ts's compileAsync export,
 * esbuild's classic-pragma JSX lowering to createElement(...) calls) --
 * not by analogy to another framework's test suite.
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs/promises";
import { UiCompiler } from "../../src/index";

async function withTempFile(
  ext: string,
  contents: string,
  fn: (filePath: string) => Promise<void>,
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(process.cwd(), "temp-"));
  const filePath = path.join(dir, `test${ext}`);

  try {
    await fs.writeFile(filePath, contents, "utf-8");
    await fn(filePath);
  } finally {
    try {
      await fs.unlink(filePath);
      await fs.rmdir(dir);
    } catch (error) {
      console.error("Error cleaning up temp files:", error);
    }
  }
}

describe("FRAME-001 Stage 0 -- compiler-level identity companion", () => {
  const compiler = new UiCompiler();

  const uixSource = `
    import { SwissComponent } from '@swissjs/core';

    export class ThreeStaticSiblings extends SwissComponent {
      render() {
        const itemA = <div>Item A</div>;
        const itemB = <div><input type="text" name="b-input" /></div>;
        const itemC = <div>Item C</div>;
        const items = this.state.reordered ? [itemA, itemC, itemB] : [itemA, itemB, itemC];
        return <div>{items}</div>;
      }
    }
  `;

  it("compiles three static sibling JSX div literals to three distinct createElement calls", async () => {
    await withTempFile(".uix", uixSource, async (filePath) => {
      const result = await compiler.compileFile(filePath);

      // Grounding assertion (should pass today, unconditionally): esbuild's
      // classic-pragma JSX lowering (compiler.ts's transformJsxWithEsbuild)
      // really does turn each of the three static div literals into its own
      // createElement("div", ...) call -- confirms the fixture actually
      // reaches the real compile pipeline before the identity-relevant
      // assertion below is evaluated.
      const divCalls = result.match(/createElement\("div"/g) ?? [];
      expect(divCalls.length).toBeGreaterThanOrEqual(4); // itemA, itemB, itemC, and the wrapping <div>
      expect(result).toContain('"Item A"');
      expect(result).toContain('"Item C"');
      expect(result).toContain('createElement("input"');
      expect(result).toContain('"b-input"');
    });
  });

  it.fails(
    "emits a stable identity-relevant key on the compiled createElement call for the div wrapping the input",
    async () => {
      await withTempFile(".uix", uixSource, async (filePath) => {
        const result = await compiler.compileFile(filePath);

        // Isolate the compiled createElement(...) call for itemB -- the div
        // literal that wraps the <input> -- by locating its nearest
        // preceding createElement("div", ...) call site relative to the
        // "b-input" text it contains.
        const inputIndex = result.indexOf("b-input");
        expect(inputIndex).toBeGreaterThan(-1);
        const divOpenIndex = result.lastIndexOf('createElement("div"', inputIndex);
        expect(divOpenIndex).toBeGreaterThan(-1);
        const itemBCall = result.slice(divOpenIndex, inputIndex);

        // The identity-relevant assertion: per design doc §2.2, Stage 1's
        // AST pre-pass would inject a `key` attribute onto this JSX node
        // (no explicit author key exists in the fixture), synthesized from
        // this literal's own fixed source position. No such pass runs
        // today (compileAsync has no pre-pass between processImports and
        // transformJsxWithEsbuild), so this does not hold yet -- that is
        // exactly what this it.fails() documents, and exactly what would
        // need to change for this assertion to flip.
        expect(itemBCall).toMatch(/key:\s*["'`]/);
      });
    },
  );
});
