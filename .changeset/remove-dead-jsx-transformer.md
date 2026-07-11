---
"@swissjs/compiler": patch
---

Remove the dead TS-AST-based JSX transformer (`transformers/jsx-transformer.ts` and its `transformers/jsx/` dependency). It implemented a second, fully independent JSX transformation approach alongside the esbuild-based transform `compileAsync()` actually uses, and had no remaining callers anywhere in the package -- a leftover from before this session's `compile()`/`compileAsync()` consolidation made the esbuild-based transform the sole JSX transformation path. No public API change; nothing exported this internal module.
