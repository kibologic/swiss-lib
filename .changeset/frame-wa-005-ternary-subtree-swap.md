---
"@swissjs/core": patch
---

Fix FRAME-WA-005: a ternary swap from a text-returning render to a subtree-returning render (or
vice versa) never patched the DOM. Root cause was in the reconciler/commit pipeline:
`component-rendering.ts`'s `renderComponent()` links a class component's instance back to
`dom-creation.ts` via `rendered.__componentInstance`, which only works when `rendered` is an
object — a component whose first `render()` call returns a text/primitive value broke that link.

Commit: 2bb19e7.
