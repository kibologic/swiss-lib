/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { Plugin } from "vite";
import { UiCompiler } from "@swissjs/compiler";
import { transform as esbuildTransform } from "esbuild";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

export interface SwissJsPluginOptions {
  /**
   * File extensions this plugin compiles. Defaults to .ui and .uix -- the
   * two SwissJS source extensions @swissjs/compiler understands.
   */
  extensions?: string[];
}

// Order matches swite's own resolveExtensionFix
// (src/resolution/rewriting/import-rewriter.ts): a .js-suffixed relative
// specifier (standard Node16/TS-ESM convention -- source imports
// './Foo.js', the real file is './Foo.ts') should resolve to whichever of
// these actually exists on disk.
const SIBLING_EXTENSIONS = [".ts", ".tsx", ".ui", ".uix"];

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
 * CSS handling and env-var inlining are intentionally NOT reimplemented
 * here -- those are Vite's own job via its native pipeline, unlike swite's
 * dev-engine where they're bespoke dev-server concerns. Import *resolution*
 * for the standard TS-ESM ".js-suffix-means-.ts-file" convention (used
 * throughout .ui/.uix source in this ecosystem) does need a resolveId hook
 * below, since Vite's default resolver doesn't handle that convention on
 * its own -- this mirrors swite's own resolveExtensionFix, not new logic.
 */
export function swissjs(options: SwissJsPluginOptions = {}): Plugin {
  const extensions = options.extensions ?? [".ui", ".uix"];
  const compiler = new UiCompiler();

  return {
    name: "swissjs",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      if (!source.endsWith(".js") && !source.endsWith(".jsx")) return null;

      const base = source.replace(/\.jsx?$/, "");
      const dir = dirname(importer);
      for (const ext of SIBLING_EXTENSIONS) {
        const candidate = resolvePath(dir, base + ext);
        if (existsSync(candidate)) return candidate;
      }
      return null;
    },
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
