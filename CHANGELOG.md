# Changelog

## [@swissjs/core 0.1.10] — 2026-05-31

### Fixed
- renderer: `cleanupNode` now calls `unmountComponent()` on component instances before removing them from the registry (#8)
- renderer: Stale prop keys are deleted when a parent stops passing them, preventing ghost props in reactive updates (#9)
- package: Corrected `repository` URL in published `runtime/package.json` (#10)
- reactivity: Added MAX_RERUNS (100) guard to `Effect.execute()` to terminate infinite reactive feedback loops with a clear error (#11)
- renderer: `render()` errors are now routed to the nearest error boundary via `captureChildError`; re-thrown only when no boundary exists (#12)
- reconciliation: Duplicate keys in children lists emit a `logger.warn` in non-production mode (#13)
- types: Added `defineComponent<P>()` helper and `JSX` namespace declaration so prop types are preserved through the JSX factory (#14)
- api: Added `ref<T>()` primitive and wired `ref` prop handling into DOM creation for direct DOM node access (#15)
- reactivity: Batch state (`isBatching`, `batchedSignals`) is now isolated per `AsyncLocalStorage` context in Node.js to prevent SSR request cross-contamination (#16)
- compiler: `propTypes` block extraction now uses brace-depth counting instead of lazy regex, fixing incorrect truncation on nested object values (#17)
- utils: Added `setLogTransport()` / `resetLogTransport()` API to `logger` for custom log sinks; all logger methods route through the transport (#18)

## [0.2.0] — 2026-03-27

### Security
- XSS: SSR route loader data now JSON-serialised with entity escaping before
  interpolation into script tags (router/ssr/server-renderer.ts)
- CORS: wildcard origin + credentials:true now throws at config time instead
  of silently allowing credentialed requests from any origin (security/middleware)
- CSP: unsafe-inline removed from default script-src and style-src
- IndexedDB: createIndexedStorage now uses real IDBOpenDBRequest with explicit
  in-memory fallback warning instead of silent Map fallback

### Fixed
- hookRegistry.ts / hookRegistryExtensions.ts: getStats() return type aligned —
  now returns { totalHooks, hooks: Record<string,number> } in both files
- file-router: scanDirectory now correctly updates routePrefix on recursion —
  nested routes no longer get wrong prefix (L-15)
- file-router: matchRoute now only replaces route wildcards not all asterisks —
  over-permissive matching fixed (L-16)
- router: parseURL/buildURL now guarded against window.location in SSR/Node
  environments — no longer throws outside browser (D-37)
- security: findPolicyForRequest now correctly resolves policies — body
  validation was entirely inert, now functional (L-21)
- compiler: CG-01 through CG-06 — entry resolution, externals, junction
  traversal, js-tsx fallback, default export injection (ported from swite)
- core: safeRender() return type is now VNode | null with null guard on all
  commitVNode callers (SG-07)
- core: unmount{} compiler transform now maps to unmounted() avoiding collision
  with base class unmount() (CG-08)
- forge: initializeRegistry now derives __dirname from import.meta.url — all
  forge subcommands resolve registry path correctly
- debug: removed console.log DEBUG from devtools completions.ts (L-13)
- debug: removed debug console.log/warn from router push() and handlePopState() (L-18)
- devtools: window.postMessage scoped to window.location.origin (D-35)
- router: RouteMatch interface deduplication — branches property now present (L-17)
- build: deprecated header removed from cli/commands/build.ts — Swite 0.2.0 wired

### Removed (dead code cleanup)
- 15 leftover files deleted across core, compiler, cli, security, devtools, plugins
- 2443 lines of dead code removed
- Orphaned transformer files: capability-def-annot, component-decorators,
  provides-annot, lifecycle-render-decorators, plugin-service-decorators
- Dead CLI command: init (easter egg, exited with code 1)
- Stranded security files: root middleware.ts, serialization.ts, audit.ts
- Dead devtools: placeholder.ts, client/index.ts duplicate entry point
- Dead plugin: web-storage capabilities.ts (16 unused constants)

### Known open issues (deferred to v0.3.0)
- components: temp shim in index.ui duplicates Button/Input/Modal inline
- css package: zero internal consumers, integration deferred
- router/outlet: Outlet.render() returns placeholder div
- router/ssr: hydration and renderToString integration deferred
- forge: dependency-manager stubs (installDependencies, addDependency, initGit)
- forge: downloadTemplate HTTP install not implemented
- core/portals: createPortal and useSlot are stubs

## [0.1.0] — initial release
