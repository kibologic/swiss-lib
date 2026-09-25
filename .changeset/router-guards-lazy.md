---
"@swissjs/router": minor
---

ROUTER-PER-ROUTE-GUARDS: `Route.guard`/`Route.meta`, checked only for the matched route
chain of the navigation target, alongside the router's global `beforeEach()` guards.

ROUTER-LAZY-ROUTES: `lazy(loader)` for lazy-loaded route components, with `Outlet`
rendering a pending/error placeholder around the load and `preloadLazy()` for preloading.
