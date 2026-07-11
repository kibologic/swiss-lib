# @swissjs/compiler

## 1.2.6

### Patch Changes

- Fix `.ui` files never receiving JSX transformation via `compile()`/`compileFile()`, and consolidate `compile()` to delegate to `compileAsync()` instead of maintaining two independently-drifted implementations.

  `compile()` previously only ran the JSX transform for `.uix` files, never `.ui` files, so any `.ui` file compiled through `compile()`/`compileFile()` (as opposed to the `compileAsync()` path swite's dev server and build engine actually use) came out with raw, untransformed JSX syntax still in it. `compileAsync()` is now the single implementation; `compile()` delegates to it.

  Also adds an AST-based `sourceHasJsx()` check (via TypeScript's own parser) so `.ui` files without JSX — pure logic/config files, which are common and valid per `.ui`'s "component files, not necessarily visual" convention — skip the esbuild JSX pass entirely rather than being unconditionally re-serialized by it.

## 1.2.5

### Patch Changes

- Fix `state { }` blocks silently dropping every field after the first when a block declares more than one `let`.

  `parseAndReplaceStateBlock` previously parsed only the first `let name: type = initializer;` declaration in a block and discarded the rest of the block's content entirely — not even as a plain, non-reactive field. Any component with `state { let a = ...; let b = ...; }` (a pattern used throughout real components, e.g. grouping related fields in one block) had `b` silently missing from the compiled output: reading it was `undefined`, and writing it did nothing, with no error or warning anywhere.

  Fix: `parseAndReplaceStateBlock` now loops over every `let` declaration in the block via a new `parseOneStateDecl` helper, generating a Signal-backed getter/setter pair for each one.

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

## 1.2.1

### Patch Changes

- fix(security): resolve 24 Dependabot CVEs; bump pnpm to 10.34.4

  Force patched versions for all vulnerable transitive deps via pnpm.overrides: undici, ws, form-data, js-yaml, babel/core, http-proxy-middleware. Update pnpm devDep and packageManager to 10.34.4. Bump @swissjs/cli to 1.0.0.

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
