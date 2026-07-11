---
"@swissjs/vite-plugin": patch
---

Added a `resolveId` hook to handle the standard Node16/TS-ESM convention where source imports `'./Foo.js'` but the real file is `'./Foo.ts'` (or `.ui`/`.uix`) -- used throughout this ecosystem's SwissJS source. Vite's default resolver doesn't handle that convention on its own; this mirrors swite's own `resolveExtensionFix`, not new compilation logic. Required to actually build `capability-explorer` (swiss-devtools), whose `App.ui` imports a service via `'../services/DataService.js'`.
