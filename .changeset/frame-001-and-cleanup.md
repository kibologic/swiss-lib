---
"@swissjs/core": patch
"@swissjs/compiler": patch
"@swissjs/router": patch
---

Patch release: no behavior change to shipped code.

- Removed two unreferenced scratch/dev artifacts from the compiler package
  (`compiler/_test_verify.mjs`, `compiler/temp-5O81gD/`) — dead code cleanup,
  zero importers.
- Documented SSR/hydration as experimental/unsupported (comment-only) pending
  the stable node-identity fix tracked in FABLE-FRAME-001.
- Extended the runtime's reconciliation regression test suite (null-child
  slot collapse, list reorder, fragment child reorder) — test-only, not
  shipped in the published package.
