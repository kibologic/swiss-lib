# @swissjs/core

## 1.4.0

### Minor Changes

- 24d7f4c: Add a first-class `onPropsChange(prevProps, nextProps)` lifecycle hook (FRAME-PROPS-CHANGE-HOOK).

  A method literally named `onUpdate(prevProps)` was never a real lifecycle hook in this
  framework — it was never invoked by the compiler or runtime, at any point. office shipped
  nine components relying on that assumed convention (PRs #167/#169), each a real dead-code
  stale-UI bug, and had to work around it with an app-side `watchProp()` helper diffing
  `this.on('updated', ...)`.

  `onPropsChange(prevProps, nextProps)` is now invoked by the framework itself:
  - fires once per actual (shallow-diffed) prop change, not on every DOM commit;
  - receives both the previous and next props as plain object snapshots;
  - fires for a parent-driven prop push into a reused component instance (e.g. a router
    reusing the same page across a route change) as well as an ordinary parent re-render;
  - never fires on mount;
  - coexists with the existing `this.on('updated', cb)` hook, which still fires on every
    commit (state or props) — `onPropsChange` is the narrower, props-only signal.

  Also adds a dev-mode warning when a component class defines `onUpdate`, `componentDidUpdate`,
  or `onPropsChanged` — none of which the framework calls — pointing at `onPropsChange` and
  `this.on('updated', cb)` instead.

  See `runtime/README.md`'s "Reacting to prop changes" section for usage and how to compare a
  single prop key instead of the default shallow whole-props diff.

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

- 87ed4c0: Fix component-renders-component instance identity (FRAME-002): when a component renders another
  component directly with no wrapping element (e.g. an `ErrorBoundary` returning its single child),
  both map to one DOM node. The mount path previously stored the OUTER instance in
  `componentInstances`, whose guard could never match because `renderComponent` overwrites the
  rendered child vnode tag with the INNER instance during recursion — so the mounted inner instance
  was evicted and re-clobbered on every subsequent update. The inner (rendered) instance is now kept
  as the shared-node owner.

  Commit: 92f50aa.

- 87ed4c0: Fix Fragment sibling-count mismatch (FRAME-008): a `<>...</>` Fragment vnode creates a
  `document.createDocumentFragment()` at mount, whose children merge directly into the real parent
  element on insertion (a DocumentFragment never persists as its own node). A Fragment sitting among
  sibling vnodes in a `children` array was therefore ONE logical entry but contributed N entries to
  the live `parent.childNodes`, desynchronizing index-derived identity during reconciliation.
  Fragment children are now flattened before diffing.

  Commit: b0c0a92.

- a7ba67b: Fix conditional branch lost when switching to an element branch (FRAME-010): in
  reconcileChildren, an unkeyed element's type-based fallback could take the DOM node that a later
  sibling owned by exact key, and the exact-key match did not check the node was already claimed.
  Two new children then mapped onto one DOM node and the other node was swept as a leftover, so the
  branch vanished and the subtree stopped reconciling. Fallbacks now skip nodes whose key a later
  new child claims, and an already-claimed exact match is not reused.
- 39eb21c: FRAME-011: a component whose render() returns a multi-node Fragment root spread N DOM nodes into its
  parent while the parent's vnode list counted one, so the reconcile staleness guard bailed on every
  commit and everything beneath that parent froze silently (office PDF reader sidebar stuck on
  "Loading table of contents..."). Components render ONE root element; the runtime now warns once per
  offending component class at mount, and warns once per parent when the guard's retries are exhausted
  instead of dropping the update without a trace.
- 2384b0c: Fix a list of component siblings losing all but one member when it grows on update
  (FRAME-component-list-sibling-instance-steal). When a `Button`/chip list gained items (actions
  arriving after data load, a conditional extra chip, shrink-then-grow), every newly added
  same-type sibling was handed the already-mounted sibling's instance and DOM node -- by
  `transferDOMReferencesFromOldTree`'s type search and by `createDOMNode`'s live-DOM instance
  search -- so N positions collapsed onto one DOM node and only the last write survived (the
  "first Button of a list does not render" report from office). Instances already backing a
  sibling are now excluded from both searches, and a position that matched no old child is
  created fresh without the instance search.
- b22f77c: FRAME-UPDATED-HOOK-GUARD: the UpdateManager loop guards (the `updated`-hook commit guard and the `performUpdate` render gate) now use a true sliding 1-second window. Previously the counter reset only after a >1s gap since the last counted event, so any component committing at least once per second for a minute was reported as "60/s" and, for the commit guard, had its `updated` hook silently skipped until a quiet second. The guards now trip only on 60 or more events within one second (a genuine loop) and recover as soon as the rate drops.
- 87ed4c0: Fire the `"updated"` lifecycle hook on every DOM-commit path, not just the explicit
  `scheduleUpdate()`/`performUpdate()` path. Three independent commit strategies existed
  (`commitVNode`, `performUpdate`, and `dom-updates.ts`'s `updateComponentNode`, which runs when a
  parent's own reconciliation revisits an already-mounted child component's vnode position); all
  three now fire `"updated"` after a real DOM commit. Root-caused a bug where `this.on('updated', cb)`
  was silently dead for any component whose re-renders are driven by reactive state writes rather
  than an explicit update call (office's `PdfViewerPage` and others). Also fixes `event-system.ts`'s
  module-level `on()` override shadowing the lifecycle-hook registrar on
  `SwissComponent.prototype.on`, which was the actual root cause once traced through.

  Commits: 8cbf81d, 7b2d0e9, 560662a.

## 1.3.0

### Minor Changes

- Add a headless, reactive form-state primitive: `createForm()` plus composable
  validators (`required`, `minLength`, `maxLength`, `pattern`, `email`, `min`,
  `max`). Exposes per-field and whole-form reactive state (values, errors, touched,
  dirty, isValid, isSubmitting) and handlers (setValue, setTouched, handleChange,
  handleBlur, reset, handleSubmit), including async validation.

  Framework-agnostic of the DOM — handlers work with a DOM `Event` or a plain
  `(field, value)` call, so forms are unit-testable without a DOM. Built entirely
  on the existing SwissJS reactivity primitives (`signal`/`computed`) — no new
  dependencies. Ships with `runtime/src/__tests__/forms.test.ts` (13 tests). See
  swiss-lib PR #110.

- 565e472: Remove `runtime/src/fenestration/` and its published export surface
  (`FenestrationRegistry`, `FenestrationContext`, `SwissComponent.fenestrate`/
  `fenestrateAsync`, `CapabilityManagerComponent`). This is a breaking change for
  any consumer that imported `FenestrationRegistry`/`FenestrationContext` from
  `@swissjs/core` or called `fenestrate`/`fenestrateAsync` on a `SwissComponent`
  instance.

  Disposition and full rationale: `registry/fable/framework/FABLE-FRAME-004-fenestration-disposition.md`
  (FABLE-FRAME-004). Read that document before concluding the underlying idea was
  judged worthless -- it was not. The _implementation_ is removed (zero product
  consumers, zero tests, decorative security -- `register()` hardcoded
  `security: {}`/`scope: "component"` so `validateSecurity` degenerated to "do
  you have a component?", and `FenestrationContext` let the caller assert its
  own `user.roles`/`session.permissions`). The _idea_ -- capabilities brokered
  and audited at a boundary crossing, rather than propagated through layers --
  is preserved as the design of record for `AR-031`, the federation trust
  boundary finding, gated on that work being scheduled.

  `SwissComponent.validateCapabilities()` and `clearCapabilityCache()` are kept
  as no-op lifecycle hooks (still called unconditionally by `ssr.ts` and
  `component-lifecycle.ts`); only the fenestration-backed capability resolution
  path is removed.

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

- Add a transition API for enter/leave/move animations. Elements can now animate
  on enter, leave, and reorder via a name-keyed transition registry and a runtime
  that applies enter/leave/move classes and waits on `transitionend`/`animationend`
  before committing removals. Public API exported from `@swissjs/core`.

  Built entirely on the existing renderer (reconciliation/dom-creation/dom-updates
  hooks). Runtime suite green. Ships with `runtime/src/__tests__/transition-api.test.ts`
  (8 tests). See swiss-lib PR #108.

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
