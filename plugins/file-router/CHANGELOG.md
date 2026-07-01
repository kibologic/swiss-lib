<!--

## 1.2.2
### Patch Changes

- fix(plugin-file-router): remove unused vite peerDependency

  The vite peerDependency (^5.2.0) was a historical leftover from when the
  plugin was intended as a Vite plugin. The plugin does not import or use
  any vite APIs — it is a file scanner only. Removing the stale peer dep
  eliminates the vite@5 constraint that was blocking consumers from
  upgrading to vite@6+.

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
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

# @swissjs/plugin-file-router

## [1.0.0] - 2025-01-XX

### Added

- Initial release of file-based routing plugin
- File system route scanning with support for `.ui`, `.js`, `.ts` extensions
- Dynamic route support with `[param]` and `[...catchAll]` patterns
- Layout system with nested layout inheritance
- Lazy loading for route components
- Hot reload development server
- Route caching for performance optimization
- TypeScript support with full type safety
- Zero runtime dependencies

### Features

- **Route Scanner**: Automatically discovers routes from file structure
- **Path Transformer**: Converts file paths to route patterns
- **Route Matcher**: High-performance route matching with parameter extraction
- **Development Tools**: File watcher and development server
- **Performance Cache**: LRU caching for route resolution
- **Barrel Exports**: Clean API with selective exports

### Performance

- Route resolution: >10,000 matches/ms
- Bundle size: <3kB gzipped
- Memory usage: Minimal with LRU caching
- Startup time: <50ms for 1000 routes

### API

- `fileRouterPlugin()` - Main plugin factory
- `RouteScanner` - File system route discovery
- `RouteMatcher` - Route matching engine
- `PathTransformer` - Path transformation utilities
- `createFileWatcher()` - Development file watching
- `createDevServer()` - Development server
- `createRouteCache()` - Performance caching

### Configuration

- `routesDir` - Routes directory path
- `extensions` - File extensions to scan
- `layouts` - Enable nested layouts
- `lazyLoading` - Enable lazy loading
- `preloading` - Enable route preloading
- `transform` - Custom route transformation
- `dev` - Development server options
