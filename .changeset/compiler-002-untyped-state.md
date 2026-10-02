---
"@swissjs/compiler": patch
---

Fix untyped `state { let x = v; }` declarations being emitted as a raw `{ let x = v; }` block
inside the class body (COMPILER-002). That is invalid TypeScript, so swite's esbuild step failed
with `Expected identifier but found "{"` and the module served HTTP 500. Untyped declarations
(including `let a = 1, b = 'x';` and `let g;`) now compile to the same Signal-backed
getter/setter as typed ones, with types left for TypeScript to infer. Any other content inside a
`state {}` block now raises a clear `SWISS_002` error naming `file:line` instead of being emitted
raw.
