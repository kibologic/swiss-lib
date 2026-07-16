# @swissjs/core

## 1.2.13

### Patch Changes

- Republish: 1.2.12 was built without the `_skipNextUpdate` click-no-response fix due to a build-tooling error (the runtime dist was not regenerated before publish). 1.2.13 ships the correct build with the fix included. 1.2.12 is deprecated on npm.

## 1.2.12

### Patch Changes

- 457e785: fix(runtime): scope `_skipNextUpdate` to the child-creation tick so it can no longer silently drop a later explicit update. Fixes the intermittent "clicking a nav icon / tab does nothing, the same click again works, a reload fixes it" bug: `_skipNextUpdate` was armed on child creation but only consumed by the explicit `performUpdate()` path (never by the signal-driven `commitVNode()` path), so when the redundant post-init update never arrived the flag lingered and swallowed the next real prop-driven update to that child.

## 1.2.11

### Patch Changes

- 54af1c4: fix(runtime): stop index-derived DOM identity from corrupting reconciliation across dual commit pipelines

  `ae25088` fixed the deletion manifestation of the dual-commit-pipeline race (a stale
  `vnode.dom` reference caused a live child to be deleted). This closes the remaining
  insertion/anchor manifestation, root-caused live in `UsersPage`'s restored-tab lifecycle
  ("WorkspaceHeader vanishes, KPI cards scatter/overlap"):
  - `updateElementNode`'s old/new-child DOM restore loops (`dom-updates.ts`) recovered a
    missing `.dom` reference by matching `dom.childNodes[index]` against tag name only, with
    no key/class/id check. Position is only a valid proxy for identity when the logical
    children count matches the live DOM count; the restore now only fires under that parity.
  - `reconcileChildren` (`reconciliation.ts`) now aborts its diff/mutation pass entirely when
    `oldChildren.length` doesn't match the live child count. That mismatch proves this pass's
    view of the parent is stale relative to a more current commit — no amount of smarter
    per-child matching makes partially applying a stale view safe, since the "remove leftover
    nodes" step would still delete whatever the more current commit already added. Both
    commit pipelines always re-render fresh immediately before committing, so bailing out
    defers the stale pass's update to the next, accurate commit rather than losing it.

  Covered by `insertion-anchor-repro.test.ts`, a sibling to `record-header-repro.test.ts`.

## 1.2.8

### Patch Changes

- f699ae5: Declare `reflect-metadata` as a peer dependency instead of a devDependency. `@swissjs/core`'s runtime (`browser.ts`, `index.ts`, and the decorator implementations) does `import "reflect-metadata"` unconditionally, but the package never told npm/pnpm that consumers need to install it themselves — it was only present in `@swissjs/core`'s own devDependencies, satisfying its own build/tests but nobody else's. Any app or bundler (Vite, Rollup, webpack) resolving `@swissjs/core` from npm without already having `reflect-metadata` installed as an unrelated transitive dependency would fail to build with an unresolved-import error at `dist/browser.js`.

## 1.2.5

### Patch Changes

- Fix a reconciliation bug where a child element already correctly present in the DOM could be silently deleted during a later update, even though both the old and new vnode trees described it identically.

  Root cause: `reconcileChildren`'s old-children pass resolved each child's DOM node as `vnode.dom ?? liveDOMNode`, unconditionally trusting a vnode's own `.dom` reference over the node actually live in the parent. When two independent commit pipelines for the same component (an explicit `scheduleUpdate()` call and a signal-driven reactive commit) each built and committed their own vnode tree in close succession, a vnode object from an earlier cycle could carry a `.dom` pointer to a node a later cycle had already replaced. Trusting that stale pointer meant the update silently patched a detached node while the real live child was never marked as processed, so the "remove leftover nodes" cleanup deleted it.

  Fix: only trust a vnode's own `.dom` reference when it's still genuinely attached to the parent/document being reconciled; otherwise fall back to the live DOM, which can never be stale. Applied both in `reconcileChildren` (children-level) and `SwissComponent.commitVNode` (component-root-level), the same class of staleness hazard existed in both places.

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

- Updated dependencies
  - @swissjs/security@1.2.1
  - @swissjs/shared@1.2.1

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
  - @swissjs/security@1.2.0
  - @swissjs/shared@1.2.0

## 0.2.0

### Minor Changes

- fix(T-005): eliminate double-render on Signal + scheduleUpdate in same event handler

  When a `.uix` event handler mutates Signal-backed state AND calls `this.scheduleUpdate?.()`,
  two independent microtasks were queued causing two full DOM reconciliation passes per
  keystroke. Input focus was lost between passes.

  **What changed:** `ReactivityManager.setupReactivity()` now sets `component._signalCommitPending = true`
  before its microtask commit and clears it when done. `UpdateManager.scheduleUpdate()`
  checks this flag first and short-circuits when a signal commit is already pending.
  Single reconciliation pass per event. Focus guard (focus-guard.ts) remains for replaceChild edge cases.

## 0.1.11

### Patch Changes

- fix(renderer): guard `process.env` in reconciliation duplicate-key check with `typeof process !== "undefined"` — fixes ReferenceError crash in browser environments introduced in 0.1.10 (#13 hotfix)

## 0.1.10

### Patch Changes

- 18 audit fixes: unmount lifecycle in DOM cleanup, stale prop deletion, correct repo URL, effect re-run guard, render() error boundaries, duplicate key dev warning, JSX prop types, ref() API, SSR batch isolation, propTypes brace-depth parser, pluggable logger transport

## 0.1.9

### Patch Changes

- fix(reactivity): props are now reactive — child components re-render when parent passes new props

  Props are now wrapped in `reactive()` at construction, matching how state is handled.
  Parent-to-child prop updates mutate the existing reactive proxy in-place so Signal
  tracking is preserved and the render effect re-runs on prop changes.
  `clearRenderCache` is called on every prop update.
  Child components created via `createDOMNode()` now receive the `beforeMount`
  lifecycle hook before `mounted`, matching root component behaviour.

## 0.1.8

### Patch Changes

- fix: remove debug console.log from click event wrapper

## 0.1.7

### Patch Changes

- fix(publish): replace workspace:\* deps with real semver versions

  0.1.6 shipped with `"@swissjs/shared": "workspace:*"` and
  `"@swissjs/security": "workspace:*"` in its published package.json. pnpm
  rejects workspace protocol specifiers outside the monorepo, making 0.1.6
  uninstallable in all consumer repos. Both deps are published packages — replaced
  with `^0.1.15` and `^0.1.13` respectively.

## 0.1.6

### Patch Changes

Three distinct rendering bugs fixed, all in `runtime/src`. Root cause analysis was
T-005.

#### fix(core): focus-guard positional fallback for inputs without name/id

`focus-guard.ts` — `FocusState` now records `parentEl` and `siblingIndex` (position
among focusable siblings within the parent element). When `restoreFocusState()` cannot
locate a replacement by `name`/`id` (because the input has neither), it falls back to
finding the element at the same sibling index within the surviving parent container.

Previously, any input field that lacked a `name` or `id` attribute would permanently
lose focus on every keystroke because the guard's only recovery path required one of
those attributes.

#### fix(core): coalesce rapid signal changes into one DOM commit per microtask

`reactivity-setup.ts` — The render effect no longer commits the DOM synchronously on
every signal notification. Instead it queues a `queueMicrotask` callback that commits
the latest VNode once per microtask tick. Multiple synchronous signal changes (e.g. an
event handler that updates several state fields, or rapid input events) now produce a
single reconciliation pass rather than one per signal.

The initial effect execution is skipped — `mount()` performs the first DOM commit
explicitly after `beforeMount` fires.

#### fix(core): reconciler type-based fallback for unkeyed component VNodes

`reconciliation.ts` — When reconciling children and an exact key lookup fails for an
unkeyed component VNode, the reconciler now scans the old key map for the first
unprocessed entry with the same component constructor. This prevents mounted components
from being torn down and recreated when a conditional sibling is inserted before them
(e.g. a slide-over panel toggled via a page-level boolean signal), which shifted all
subsequent index-based keys by one and caused the reconciler to treat every existing
component as a new one.

This fallback activates only for component VNodes that have no explicit `key` prop.
Explicitly keyed components continue to match strictly by key.

#### fix(core): throttled updates reschedule instead of silent drop

`update-manager.ts` — When `updateCount >= MAX_UPDATES_PER_SECOND`, instead of
silently returning and leaving the component in a stale state, the update manager now
schedules a single `setTimeout` callback that fires after the throttle counter resets.
The deferred callback resets the counter and runs `performUpdate()` once.

Previously, a burst of rapid signal changes (e.g. window resize events firing faster
than 60/s) would hit the throttle limit and leave the component frozen at its last
rendered state until a hard browser refresh.

## 1.0.2

### Patch Changes

- c106549: fix(core): add FocusGuard to preserve input focus across reactive reconciliation passes

  Adds `packages/core/src/component/focus-guard.ts` with `saveFocusState()` and
  `restoreFocusState()`. Guards are applied in both `SwissComponent.commitVNode()` (signal
  effect path) and `UpdateManager.performUpdate()` (explicit scheduleUpdate path).

  When the VDOM reconciler uses `replaceChild` instead of an in-place update, the previously
  focused INPUT, TEXTAREA, or SELECT element is destroyed, causing immediate focus loss.
  The guard captures `activeElement` + `selectionStart`/`selectionEnd` before each
  reconciliation pass and restores them after — either to the surviving element or to a
  replacement found by `name`/`id` attribute when the original was replaced.

  Fixes: keystroke-by-keystroke focus loss in all .uix form fields and modals.
