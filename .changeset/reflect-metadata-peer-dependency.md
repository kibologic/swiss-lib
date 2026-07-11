---
"@swissjs/core": patch
---

Declare `reflect-metadata` as a peer dependency instead of a devDependency. `@swissjs/core`'s runtime (`browser.ts`, `index.ts`, and the decorator implementations) does `import "reflect-metadata"` unconditionally, but the package never told npm/pnpm that consumers need to install it themselves — it was only present in `@swissjs/core`'s own devDependencies, satisfying its own build/tests but nobody else's. Any app or bundler (Vite, Rollup, webpack) resolving `@swissjs/core` from npm without already having `reflect-metadata` installed as an unrelated transitive dependency would fail to build with an unresolved-import error at `dist/browser.js`.
