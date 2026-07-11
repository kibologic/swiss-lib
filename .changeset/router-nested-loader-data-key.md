---
"@swissjs/router": patch
---

Fix `loadRouteData()` keying loader results by `match.route.path` (the route definition's own, possibly-relative path segment, e.g. `"child"` for a nested route defined under a parent) instead of `match.path` (the fully resolved matched URL, e.g. `"/parent/child"`). For top-level routes these happen to be identical, which is why the bug only showed up on nested routes: any consumer reading `data['/parent/child']` after a nested-route navigation got `undefined`, with the actual result silently stored under the wrong key (`data['child']`).
