---
"@swissjs/compiler": patch
---

Fix `stripJSDocComments()` deleting real code when `/**` appears inside a `//` line comment,
string, template literal, or regex (DISC-2026-08-24-001 / COMPILER-001). The previous
implementation scanned raw source with `/\/\*\*[\s\S]*?\*\//g` with no awareness of comment or
literal context — e.g. a glob like `queue/**/*.yaml` inside a `//` comment opened a false JSDoc
block that consumed everything up to the next literal `*/` anywhere later in the file, silently
deleting real code. This is what deleted ~120 lines of office's `RegistryPage.uix` in August 2026,
surfaced only as a misleading esbuild error.

Commit: c311b0c (PR #138, merged 2026-09-25).
