---
"@swissjs/router": patch
---

ROUTER-LAZY-SSR-TYPING: fix `tsc -b router` failing with TS2769 (a build break bisected to
#141's `Route.component: ComponentLike | LazyComponent` widening, on top of #106's streaming
SSR). `ServerRenderer`'s `buildRouteTree`/`buildComponentVNode` now resolve a lazy route's
`component` (`await component.load()`) before building its `VNode`, for both `render()` and
`renderStream()`, instead of passing the `LazyComponent` wrapper straight into
`createElement` (which silently rendered empty markup at runtime, and only failed to
type-check because vitest never runs `tsc`). A rejected lazy loader now renders an
SSR-002-style error-boundary fallback (`statusCode: 500`, `hadRenderErrors: true`) instead
of an unhandled rejection. Non-lazy routes are byte-identical (unchanged, pre-existing
`ssr.test.ts`/`ssr-stream.test.ts` coverage). Also adds a `type-check` package script
(router previously had none, so the repo's own `turbo run type-check` silently skipped it)
and a vitest test (`tests/typecheck.test.ts`) that spawns `tsc -b` so a type break fails
`vitest` directly, not only a separately-run type-check step.
