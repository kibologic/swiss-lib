# @swissjs/vite-plugin

## 0.2.2

### Patch Changes

- Updated dependencies [ff8cbb0]
  - @swissjs/compiler@1.3.1

## 0.2.1

### Patch Changes

- d72be32: Added a `resolveId` hook to handle the standard Node16/TS-ESM convention where source imports `'./Foo.js'` but the real file is `'./Foo.ts'` (or `.ui`/`.uix`) -- used throughout this ecosystem's SwissJS source. Vite's default resolver doesn't handle that convention on its own; this mirrors swite's own `resolveExtensionFix`, not new compilation logic. Required to actually build `capability-explorer` (swiss-devtools), whose `App.ui` imports a service via `'../services/DataService.js'`.
- Updated dependencies [d72be32]
  - @swissjs/compiler@1.2.10

## 0.2.0

### Minor Changes

- 20d307e: New package: a Vite plugin that compiles `.ui`/`.uix` SwissJS source files. Pure delegation to `@swissjs/compiler`'s `UiCompiler.compileAsync()` (the same transform swite's dev-engine calls) plus a generic esbuild TS-loader pass -- no compilation logic of its own. For standalone Vite-based tools and external adoption; Alpine product apps stay on swite.
