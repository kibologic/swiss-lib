---
"@swissjs/core": patch
---

Fix conditional branch lost when switching to an element branch (FRAME-010): in
reconcileChildren, an unkeyed element's type-based fallback could take the DOM node that a later
sibling owned by exact key, and the exact-key match did not check the node was already claimed.
Two new children then mapped onto one DOM node and the other node was swept as a leftover, so the
branch vanished and the subtree stopped reconciling. Fallbacks now skip nodes whose key a later
new child claims, and an already-claimed exact match is not reused.
