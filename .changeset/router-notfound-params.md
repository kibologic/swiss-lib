---
"@swissjs/router": minor
---

ROUTER-NOT-FOUND: `RouterOptions.notFound?: ComponentLike`, rendered by `Outlet` when no
route matches, instead of an empty `<div class="outlet-empty">`.

ROUTER-PARAM-MERGE: explicit `mergeParams(matches)` export; `Outlet` now uses it to pass
the merged params of the entire matched chain to the leaf component.
