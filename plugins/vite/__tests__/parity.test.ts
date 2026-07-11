/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/*
 * Contract test (Fable ruling A6, registry/fable/FABLE-DECISIONS-2026-07-11.md §A6
 * point 3): shared .ui/.uix fixtures compiled through the plugin and through
 * swite's handler must produce equivalent output.
 *
 * swite lives in a separate repo and cannot be imported here -- that would be
 * a swiss-lib -> swite dependency, backwards from the documented
 * core/compiler -> swite -> cli release-ordering chain (§A1 of the same
 * ruling doc). Instead this mirrors swite's exact compilation pipeline
 * (src/dev-engine/handlers/base-handler.ts: UiCompiler.compileAsync() then
 * a generic esbuild TS-loader pass) independently, inline, and asserts the
 * plugin's actual transform() produces the same compiled code. Two
 * independent call sites doing the same two steps and landing on identical
 * output is the parity guarantee -- if either implementation drifts from
 * the other, this test catches it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UiCompiler } from "@swissjs/compiler";
import { transform as esbuildTransform } from "esbuild";
import { swissjs } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

// Mirrors swite's base-handler.ts compileAndServe() exactly, minus the
// dev-server-only concerns (CSS URL rewriting, bare-import rewriting for
// swite's own URL scheme, env inlining) that have no meaning for a Vite
// plugin -- Vite handles imports/CSS/env through its own native pipeline.
async function compileLikeSwite(source: string, filePath: string): Promise<string> {
  const compiler = new UiCompiler();
  const compiled = await compiler.compileAsync(source, filePath);
  const result = await esbuildTransform(compiled, {
    loader: "ts",
    format: "esm",
    target: "esnext",
    sourcefile: filePath,
    sourcemap: "inline",
  });
  return result.code;
}

async function compileWithPlugin(source: string, filePath: string): Promise<string> {
  const plugin = swissjs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformFn = (plugin as any).transform;
  const result = await transformFn.call({}, source, filePath);
  if (!result) throw new Error(`Plugin declined to transform ${filePath}`);
  return typeof result === "string" ? result : result.code;
}

describe("swite/vite-plugin compilation parity", () => {
  it.each(["simple.ui", "with-jsx.uix"])("%s: plugin output matches swite's pipeline", async (fixtureName) => {
    const filePath = resolve(fixturesDir, fixtureName);
    const source = readFileSync(filePath, "utf-8");

    const switeOutput = await compileLikeSwite(source, filePath);
    const pluginOutput = await compileWithPlugin(source, filePath);

    // Both pipelines emit an inline source map comment with esbuild's own
    // internal state (timestamps/paths can vary in incidental ways across
    // separately-run transform() calls); strip both before comparing so the
    // assertion is about the actual compiled *code*, not incidental map bytes.
    const stripSourceMap = (code: string) => code.replace(/\/\/# sourceMappingURL=.*$/m, "").trimEnd();

    expect(stripSourceMap(pluginOutput)).toBe(stripSourceMap(switeOutput));
  });

  it("declines to transform non-SwissJS files", async () => {
    const plugin = swissjs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformFn = (plugin as any).transform;
    const result = await transformFn.call({}, "export const x = 1;", "/some/file.ts");
    expect(result).toBeNull();
  });

  it("respects a custom extensions option", async () => {
    const plugin = swissjs({ extensions: [".custom"] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformFn = (plugin as any).transform;
    const declined = await transformFn.call({}, "export const x = 1;", "/some/file.ui");
    expect(declined).toBeNull();
  });
});
