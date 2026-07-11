/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Plugin } from "vite";
import { UiCompiler } from "@swissjs/compiler";
import { transform as esbuildTransform } from "esbuild";

export interface SwissJsPluginOptions {
  /**
   * File extensions this plugin compiles. Defaults to .ui and .uix -- the
   * two SwissJS source extensions @swissjs/compiler understands.
   */
  extensions?: string[];
}

/**
 * Vite plugin for SwissJS .ui/.uix files.
 *
 * This is pure delegation to @swissjs/compiler's own UiCompiler.compileAsync(),
 * the same transform swite's dev-engine calls -- no compilation logic lives
 * here. It exists so standalone Vite-based tools (and external adopters who
 * don't use swite) can compile SwissJS source without swite's own dev-server
 * machinery. Alpine product apps stay on swite; this is not a second
 * compilation path for products, it's a foreign-bundler on-ramp.
 *
 * Import resolution, CSS handling, and env-var inlining are intentionally
 * NOT reimplemented here -- those are Vite's own job via its native resolver
 * and plugin pipeline, unlike swite's dev-engine where they're bespoke
 * dev-server concerns.
 */
export function swissjs(options: SwissJsPluginOptions = {}): Plugin {
  const extensions = options.extensions ?? [".ui", ".uix"];
  const compiler = new UiCompiler();

  return {
    name: "swissjs",
    async transform(code, id) {
      if (!extensions.some((ext) => id.endsWith(ext))) return null;

      const compiled = await compiler.compileAsync(code, id);

      // compileAsync() fully transpiles TS+JSX when a file has JSX
      // (its internal esbuild "tsx" loader pass handles both), but a .ui
      // file with no JSX skips that pass entirely and can still carry raw
      // TypeScript syntax. This second pass -- identical to swite's own
      // dev-engine/handlers/base-handler.ts -- is the catch-all that
      // guarantees valid JS regardless of which internal path ran.
      const result = await esbuildTransform(compiled, {
        loader: "ts",
        format: "esm",
        target: "esnext",
        sourcefile: id,
        sourcemap: true,
      });

      return { code: result.code, map: result.map || null };
    },
  };
}

export default swissjs;
