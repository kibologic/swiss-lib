---
"@swissjs/vite-plugin": minor
---

New package: a Vite plugin that compiles `.ui`/`.uix` SwissJS source files. Pure delegation to `@swissjs/compiler`'s `UiCompiler.compileAsync()` (the same transform swite's dev-engine calls) plus a generic esbuild TS-loader pass -- no compilation logic of its own. For standalone Vite-based tools and external adoption; Alpine product apps stay on swite.
