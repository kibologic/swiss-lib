/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { UiCompiler } from "../src/index";

describe("Compiler .ui import rewrite", () => {
  it('leaves "./Card.ui" import specifiers untouched', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "swiss-compiler-"));
    const file = path.join(tmp, "entry.ts");
    await fs.writeFile(
      file,
      "import Card from './Card.ui';\nexport const use = Card;\n",
    );

    const compiler = new UiCompiler();
    const out = await compiler.compileFile(file);

    // processImports (import-processor.ts) used to rewrite relative .ui/.uix
    // import specifiers to .tsx, supposedly "for esbuild's JSX pipeline" --
    // verified that esbuild's transform() doesn't resolve imports at all and
    // is indifferent to their extensions, so the rewrite did nothing useful
    // there while emitting specifiers pointing at files that don't exist on
    // disk (no .tsx file is ever written). Real bundlers consuming compiled
    // output (swite, @swissjs/vite-plugin) resolve .ui/.uix directly, since
    // they already know that extension -- leaving the specifier untouched is
    // the fix, not rewriting it to something else.
    expect(out).toMatch(/from ['"]\.\/Card\.ui['"]/);
  });
});
