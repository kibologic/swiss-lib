---
"@swissjs/core": patch
---

Fix Fragment sibling-count mismatch (FRAME-008): a `<>...</>` Fragment vnode creates a
`document.createDocumentFragment()` at mount, whose children merge directly into the real parent
element on insertion (a DocumentFragment never persists as its own node). A Fragment sitting among
sibling vnodes in a `children` array was therefore ONE logical entry but contributed N entries to
the live `parent.childNodes`, desynchronizing index-derived identity during reconciliation.
Fragment children are now flattened before diffing.

Commit: b0c0a92.
