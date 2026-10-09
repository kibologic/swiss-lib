# @kibologic/router

## 1.4.0

### Minor Changes

- 9680003: Make the main entry browser-safe (ROUTER-BROWSER-ENTRY). `@swissjs/router` re-exported
  `./api/scanner`, which imports `node:fs`/`node:path`/`node:url`, so a browser
  `import('@swissjs/router')` failed to load. The server-only modules (`ServerRenderer` /
  `createServerRenderer`, the API handler and the API scanner) now live behind
  `@swissjs/router/server`; the main entry keeps the router core, `StatefulRouter`, `Outlet`,
  `Link`, `lazy` and `hydrate`. `package.json` gains an `exports` map (with `types`) for both
  entry points and drops the `"module": "dist/index.mjs"` field, which the build never emitted.

  BREAKING for Node consumers that import the server exports from the barrel: change
  `import { createServerRenderer } from '@swissjs/router'` to
  `from '@swissjs/router/server'` (same for `ServerRenderer`, `SSRContext`, `SSRResult`,
  `APIRouteHandler`, `createAPIHandler`, `APIRouteScanner`, `createAPIScanner`, `APIRoute*`
  types). Bump is `minor`, not `major`: a survey of swiss-lib and the alpine-core,
  business-alpine, alpine-shell, hospitality-alpine, swite, examples and create-swissjs clones
  found no imports of these exports (alpine repos only pin the package in pnpm overrides), and
  a `major` would drag the whole linked `@swissjs/*` set to 2.0.0. Maintainers may raise it.

- 06b7629: ROUTER-PER-ROUTE-GUARDS: `Route.guard`/`Route.meta`, checked only for the matched route
  chain of the navigation target, alongside the router's global `beforeEach()` guards.

  ROUTER-LAZY-ROUTES: `lazy(loader)` for lazy-loaded route components, with `Outlet`
  rendering a pending/error placeholder around the load and `preloadLazy()` for preloading.

- ee399a9: ROUTER-HISTORY-STACK: `Router.entries`/`historyIndex`/`back()`/`forward()`/`go(n)`/
  `canGoBack`/`canGoForward`, kept consistent with native `popstate`.

  ROUTER-PER-ENTRY-STATE: `push()`/`replace()` accept an optional serializable `state`
  payload per history entry; `onStateRestore()` restores it on `back()`/`forward()`/`go()`.
  Persistence is pluggable via an optional `historyAdapter: HistoryStateAdapter` in
  `RouterOptions` -- the router never hard-codes `localStorage`.

- aa6d50d: ROUTER-NOT-FOUND: `RouterOptions.notFound?: ComponentLike`, rendered by `Outlet` when no
  route matches, instead of an empty `<div class="outlet-empty">`.

  ROUTER-PARAM-MERGE: explicit `mergeParams(matches)` export; `Outlet` now uses it to pass
  the merged params of the entire matched chain to the leaf component.

- 9680003: Add catch-all route segments (ROUTER-SPLAT-SEGMENT). A final `*name` segment
  (`/docs/*path`) captures one or more remaining segments as a single slash-joined, undecoded
  param (`/docs/a/b/c` gives `params.path === 'a/b/c'`); a bare `*` uses the name `'*'`. The
  empty remainder does not match (`/docs` needs its own route), a splat is always tried after
  its static and `:param` siblings regardless of declaration order, and a splat that is not the
  final segment throws when matched.
- c766f37: Add streaming server-side rendering. `@swissjs/core` exports `renderToStream` (Node
  `Readable`), `renderToStreamWeb` (Web `ReadableStream`), and `renderToStringChunks` (an
  async generator yielding one chunk per top-level child of the root vnode instead of
  buffering into one string), built as a second consumer of `renderToString`'s existing
  per-vnode HTML generation -- `renderToString` itself is unchanged.

  `@swissjs/router`'s `ServerRenderer` gains `renderStream(url)`, mirroring `render(url)`
  (same route matching, loader data, `buildRouteTree` tree) but streaming the document shell
  and component markup instead of buffering.

  Parity: concatenating every chunk from `renderToStream`/`renderStream` equals the
  corresponding `renderToString`/`render` output byte-for-byte for routes that do not call
  `useHead()`/`setTitle()`/`addMeta()`/`addLink()` during render. Known, documented gap:
  `renderStream()` flushes its shell (including `<title>`) before any component executes, so
  it does not reflect per-request head customization the way `render()` does -- see
  `router/src/ssr/server-renderer.ts`'s `renderStream()` doc comment ("KNOWN GAP against
  HEAD-001") and the pinning test in `router/tests/ssr-stream.test.ts`. Do not route a page
  that depends on `useHead()` through `renderStream()` until a deferred/two-pass head design
  lands.

### Patch Changes

- 9324ff8: Reconcile persisted history with the live browser (ROUTER-HISTORY-RESTORE). The browser URL
  (path + query) now always wins for the current entry; a snapshot restored in a new tab/device
  keeps its entries as back-history and back()/forward()/go() into restored-only entries navigate
  with replaceState instead of hanging on a popstate that never arrives; a same-tab reload no
  longer clobbers the native index marker; popstate and persistence keep the query string; the
  stack is capped at MAX_HISTORY_ENTRIES (200).
- 0b44040: ROUTER-LAZY-SSR-TYPING: fix `tsc -b router` failing with TS2769 (a build break bisected to
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
- Updated dependencies [87ed4c0]
- Updated dependencies [87ed4c0]
- Updated dependencies [a7ba67b]
- Updated dependencies [39eb21c]
- Updated dependencies [2384b0c]
- Updated dependencies [24d7f4c]
- Updated dependencies [b22f77c]
- Updated dependencies [c766f37]
- Updated dependencies [87ed4c0]
  - @swissjs/core@1.4.0

## Unreleased

### Minor Changes

- ROUTER-PER-ROUTE-GUARDS: `Route.guard?: NavigationGuard` (plus a passthrough
  `Route.meta?: Record<string, unknown>`), checked only when that route or a descendant
  is the actual navigation target, after the router's global `beforeEach()` guards. Same
  block(`false`)/redirect(`string`)/allow contract as a global guard.
- ROUTER-LAZY-ROUTES: `lazy(loader)` wraps a dynamic-import loader as a `Route.component`;
  `Outlet` starts the load on first render (`outlet-lazy-pending` placeholder), renders
  the resolved component once it settles, and renders `outlet-lazy-error` (never throws)
  if the import rejects. `preloadLazy(component)` lets a caller start/await the load ahead
  of rendering. A bare `() => Promise<ComponentLike>` is intentionally not accepted
  directly as `Route.component` -- see README for why.

- ROUTER-NOT-FOUND: `RouterOptions.notFound?: ComponentLike`, rendered by `Outlet` when
  no route matches the current path, instead of the previous empty
  `<div class="outlet-empty">`. Omit it to keep the previous behavior unchanged.
- ROUTER-PARAM-MERGE: added an explicit `mergeParams(matches)` export (`matcher.ts`) and
  switched `Outlet` to use it rather than the leaf match's own `params` object. Evidence:
  the leaf's own `params` already carried every ancestor's captured value in practice
  (a side effect of how `matchRoute` re-derives params against the full concatenated
  route path at each level) -- `mergeParams()` makes that contract explicit and tested
  instead of leaving it as an accidental byproduct of the matcher's internals.

- ROUTER-HISTORY-STACK: `Router` now keeps an ordered history stack (`entries`,
  `historyIndex`) plus `back()`/`forward()`/`go(n)`/`canGoBack`/`canGoForward`, kept
  consistent with native `popstate` -- the router's own API and the browser's own
  back/forward buttons always agree on the current entry. `push()` after a `back()`
  truncates the forward branch, matching confirmed-correct browser semantics.
- ROUTER-PER-ENTRY-STATE: `push()`/`replace()` accept an optional serializable `state`
  payload per entry; `onStateRestore()` fires with that state, verbatim, whenever the
  router lands back on an existing entry. `setEntryState()` updates the current entry's
  state without navigating. Persistence is entirely pluggable via an optional
  `historyAdapter: HistoryStateAdapter` (`save`/`load`) passed in `RouterOptions` -- the
  router itself never hard-codes `localStorage` or any other storage backend. See
  office's `docs/design/office-navigation-shell.md` Part 5.3 items 1-2 for the design
  this closes.

## 1.3.0

### Minor Changes

- Add document-head management (HEAD-001). Components declare `<title>`/`<meta>`/
  `<link>` and `<html>`/`<body>` attributes from `render()` via `useHead()` (and
  `setTitle`/`addMeta`/`addLink`); the server renderer collects them into the SSR
  `<head>`, and on the client they apply to `document.head`.
  - `@swissjs/core`: the `useHead` API and a per-render `HeadContext` with
    title/meta/link de-duplication and HTML escaping.
  - `@swissjs/router`: `ServerRenderer` brackets `renderToString` with the head
    context (push/pop around the synchronous render), so concurrent SSR requests
    never leak head state into each other.

  Ships with head unit tests and router SSR-injection tests (incl. a `Promise.all`
  concurrency test). See swiss-lib PR #111.

### Patch Changes

- Updated dependencies
- Updated dependencies [565e472]
- Updated dependencies
- Updated dependencies
  - @swissjs/core@1.3.0

## 1.2.13

### Patch Changes

- Updated dependencies
  - @swissjs/core@1.2.13

## 1.2.12

### Patch Changes

- Updated dependencies [457e785]
  - @swissjs/core@1.2.12

## 1.2.11

### Patch Changes

- Updated dependencies [54af1c4]
  - @swissjs/core@1.2.11

## 1.2.9

### Patch Changes

- 266dc77: Fix `loadRouteData()` keying loader results by `match.route.path` (the route definition's own, possibly-relative path segment, e.g. `"child"` for a nested route defined under a parent) instead of `match.path` (the fully resolved matched URL, e.g. `"/parent/child"`). For top-level routes these happen to be identical, which is why the bug only showed up on nested routes: any consumer reading `data['/parent/child']` after a nested-route navigation got `undefined`, with the actual result silently stored under the wrong key (`data['child']`).

## 1.2.8

### Patch Changes

- Updated dependencies [f699ae5]
  - @swissjs/core@1.2.8

## 1.2.5

### Patch Changes

- Updated dependencies
  - @swissjs/core@1.2.5

## 1.2.4

### Patch Changes

- 740e578: Patch release: no behavior change to shipped code.
  - Removed two unreferenced scratch/dev artifacts from the compiler package
    (`compiler/_test_verify.mjs`, `compiler/temp-5O81gD/`) — dead code cleanup,
    zero importers.
  - Documented SSR/hydration as experimental/unsupported (comment-only) pending
    the stable node-identity fix tracked in FABLE-FRAME-001.
  - Extended the runtime's reconciliation regression test suite (null-child
    slot collapse, list reorder, fragment child reorder) — test-only, not
    shipped in the published package.

- Updated dependencies [740e578]
  - @swissjs/core@1.2.4

## 1.2.1

### Patch Changes

- fix(security): resolve 24 Dependabot CVEs; bump pnpm to 10.34.4

  Force patched versions for all vulnerable transitive deps via pnpm.overrides: undici, ws, form-data, js-yaml, babel/core, http-proxy-middleware. Update pnpm devDep and packageManager to 10.34.4. Bump @swissjs/cli to 1.0.0.

- Updated dependencies
  - @swissjs/core@1.2.1

## 1.2.0

### Minor Changes

- ## SwissJS v0.2.0 — Type Safety, Context API, and Renderer Hardening

  ### New Features

  **Context API** (`@swissjs/core`)
  - `createContext<T>()` — create typed context objects with default values
  - `useContext(ctx)` — consume context inside components
  - `consumeContext(ctx, component)` — low-level context consumer for renderer use
  - `SwissContext` and `SwissContextObject` types exported from core
  - Subscription-based propagation with proper cleanup on component unmount

  **Template Parser** (`@swissjs/compiler`)
  - `parseTemplate(source)` — full AST parser for SwissJS `.ui`/`.uix` templates
  - `TemplateAST` node types: Element, Text, Expression, Directive, Component, Slot, Fragment
  - Attribute/directive/event binding parsing
  - Comprehensive test suite with 190+ assertions

  **Signal improvements** (`@swissjs/core`)
  - `Signal.peek()` — read current value without triggering effect tracking; eliminates double-tracking in reactive proxy get traps
  - `batch()`, `startBatch()`, `endBatch()` — defer signal notifications, wired correctly to the signal subscriber system
  - `bindToElement` — AbortSignal support for automatic subscription cleanup on element teardown

  **Router enhancements** (`@swissjs/router`)
  - Typed `LoaderContext` and `ActionContext` replace all `any` loader/action signatures
  - Navigation listener API with full type safety
  - SSR hydration and server-renderer fully typed
  - `APIRequest` / `APIResponse` — `unknown` body replacing `any`

  **Plugin system** (`@swissjs/core`)
  - Phase 4 hook types: `onBeforeHydrate`, `onAfterHydrate`, `onRouteChange`, `onError`, `onCapabilityRequest`, `onCapabilityGrant`
  - `buildLogger`, `buildHooksSurface`, `buildPluginContext` extracted from 3 duplicate callsites
  - Comprehensive plugin manager test suite (321 assertions)

  **DevTools bridge** (`@swissjs/core`)
  - `RingBuffer<T>` — O(1) fixed-capacity event buffer replacing splice-based arrays
  - `drainEventsPaged(offset, limit)` — non-destructive paged event access
  - `requestStateSnapshot` with live restore callback support
  - `getComponentsByName` O(1) lookup via name index
  - Typed event channels (`DevtoolsEvent`, `DevtoolsEventCategory`)

  **Security** (`@swissjs/security`)
  - `sanitizeInput` with XSS, SQL-injection, and path-traversal guards
  - Structural interfaces for all security middleware (replaces `any` params)
  - `RateLimitOptions`, `ValidationOptions`, `SecurityHeadersOptions` typed middleware config
  - `SecurityEngine` extended with `runMiddleware` batch method

  ### Bug Fixes

  **Renderer** (`@swissjs/core`)
  - Focus guard in `renderToDOM` — prevents focus loss during reactive updates to DOM siblings
  - `canUpdateInPlace` stability — component VNodes with same type correctly reuse instances
  - Fragment normalizer — caches `__normalizedChildren` on VNodeBase to avoid repeated traversal
  - `reconcileChildren` — type-based fallback key generation for unkeyed element VNodes

  **Reactivity** (`@swissjs/core`)
  - `ComputedSignal` — eliminated double-subscription and stale dependency accumulation
  - `bindToElement` subscription leak — subscriber now removed on signal update when element is gone
  - Effect re-entrancy guard hardened with private `__executing` field (no longer on `this as any`)
  - Reactive proxy `Reflect.get/set/has` — eliminates unsafe `(obj as any)[prop]` patterns

  **Components / UI**
  - `Modal.uix` — extracted inline styles to `modal.css` class definitions; no more style-in-template violation
  - Components package TypeScript config fixed — `.uix` files included in type-check scope

  ### Refactors

  **Full `as any` elimination** (`@swissjs/core`) — all production source files in `runtime/src` cleaned:
  - Renderer pipeline (7 files): `component-rendering`, `dom-creation`, `dom-update-refs`, `dom-updates`, `renderer`, `reconciliation`, `fragment-normalizer`
  - Reactivity: `signals`, `reactive`, `effect`
  - Framework: `hydration`, `expression-evaluator`
  - Component: `internal`, `capability-manager-component`, `decorators/*`
  - Plugin: `pluginManagerExtensions` (typed internal accessor replaces prototype `this as any`)
  - DevTools: `bridge` (`globalThis as Record<string,unknown>`)
  - Error: `error-reporter` (typed window extension)

  **`update-manager.ts` split** — 703-line file split into `update-manager.ts` (186 lines) + `update-strategies.ts` (278 lines); enforces 700-line file limit

  **`ComponentInternals` interface** — replaces all `(instance as any)._field` patterns across renderer; `asInternal()` accessor is the canonical entry point for framework-internal component field access

  **Router** (`@swissjs/router`) — complete `any→typed` pass across `router.ts`, `matcher.ts`, `link.ts`, `outlet.ts`, `hydration.ts`, `server-renderer.ts`, `scanner.ts`, `handler.ts`

  ### Security
  - **CVE remediation** — vitest and vite lockfile chain updated to address known vulnerabilities
  - **`gitleaks` pre-commit hook** — blocks secrets in commits
  - **npm token rotation** — stale token removed from history; `.gitignore` hardened
  - **CI workflows added**: `deps-audit.yml`, `gitleaks.yml`, `semgrep.yml`, `sast-eslint.yml`, `policy.yml`, `docs.yml`, `extension-ci.yml`
  - **Husky hooks**: `pre-commit` (lint), `commit-msg` (conventional commits), `pre-push` (type-check + test)

### Patch Changes

- Updated dependencies
  - @swissjs/core@1.2.0

## 1.0.2

### Patch Changes

- Updated dependencies [c106549]
  - @kibologic/core@1.0.2
