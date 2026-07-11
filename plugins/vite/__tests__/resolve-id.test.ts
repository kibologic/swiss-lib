/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
 * Vite's default resolver doesn't handle the standard Node16/TS-ESM
 * convention where a source file imports './Foo.js' but the real file on
 * disk is './Foo.ts' (or .ui/.uix, for SwissJS source) -- used throughout
 * this ecosystem's .ui/.uix files. resolveId() mirrors swite's own
 * resolveExtensionFix (src/resolution/rewriting/import-rewriter.ts in the
 * swite repo), just implemented as a Vite resolver hook instead of swite's
 * bespoke URL rewriting.
 */
import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { swissjs } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures", "resolve-fixture");

function resolveId(source: string, importer: string) {
  const plugin = swissjs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (plugin as any).resolveId;
  return fn.call({}, source, importer);
}

describe("swissjs vite plugin resolveId", () => {
  it("resolves a .js-suffixed specifier to the real .ts sibling", () => {
    const importer = resolve(fixturesDir, "Importer.ui");
    const result = resolveId("./Sibling.js", importer);
    expect(result).toBe(resolve(fixturesDir, "Sibling.ts"));
  });

  it("returns null for a bare (non-relative) specifier", () => {
    const importer = resolve(fixturesDir, "Importer.ui");
    expect(resolveId("@swissjs/core", importer)).toBeNull();
  });

  it("returns null for a .js specifier with no importer (entry point)", () => {
    expect(resolveId("./Sibling.js", undefined as unknown as string)).toBeNull();
  });

  it("returns null when no sibling file exists at all", () => {
    const importer = resolve(fixturesDir, "Importer.ui");
    expect(resolveId("./DoesNotExist.js", importer)).toBeNull();
  });

  it("leaves non-.js relative specifiers alone (Vite's default resolver handles them)", () => {
    const importer = resolve(fixturesDir, "Importer.ui");
    expect(resolveId("./Sibling.ts", importer)).toBeNull();
  });
});
