# CROSS-001-B: browser-engine conformance harness

Runs a subset of the framework's runtime contracts (SSR round-trip, focus save/restore,
event ordering, compiled-output execution) in real **Blink**, **WebKit** and **Gecko** via
Playwright, driven by the actual `@swissjs/core` runtime build and the actual `@swissjs/compiler`
output -- not jsdom.

## Why this exists

`runtime`'s ~146 tests all run in vitest + jsdom. jsdom is an independent Node reimplementation
of parts of the DOM spec: no layout, no paint, no compositor, and its focus/selection/event
dispatch are its own approximation, not any engine's. Every one of those tests therefore
certifies behaviour in an engine that ships to zero users. See
`registry/fable/framework/FABLE-CROSS-001-cross-platform-compatibility-program.md`.

This harness ADDS an engine tier. It does not replace or weaken the jsdom suites -- those stay
fast and remain the inner-loop feedback (`pnpm exec vitest run` inside `runtime/`, `router/`, etc.).

## Running

```bash
pnpm install
pnpm --filter @swissjs/e2e-engine-conformance install:browsers   # one-time, downloads browser binaries
pnpm --filter @swissjs/e2e-engine-conformance test:engines       # all three engines
pnpm --filter @swissjs/e2e-engine-conformance test:engines:chromium
pnpm --filter @swissjs/e2e-engine-conformance test:engines:webkit
pnpm --filter @swissjs/e2e-engine-conformance test:engines:firefox
```

This is a **separate path** (`test:engines`) from the existing `pnpm test` (turbo -> vitest)
pipeline. It does not touch how any jsdom suite runs.

## What each spec proves that jsdom cannot

| Spec | Engine-only behaviour under test |
|---|---|
| `tests/ssr-round-trip.spec.ts` | Real HTML parser output + real DOM node identity across `renderToString` -> `hydrate()`. jsdom's `innerHTML` parsing and node-identity bookkeeping are jsdom's own approximation, not the engine's tree-builder. |
| `tests/focus-guard.spec.ts` | Real focus manager + real text-selection state surviving a reconciliation commit that inserts a sibling before a focused `<input>`. jsdom's `document.activeElement` is a flag set by calling `.focus()`, not a real focus ring. |
| `tests/event-ordering.spec.ts` | Real engine event dispatch (capture/bubble/`stopPropagation`) and its interleaving with the runtime's `queueMicrotask`-coalesced commit, verified against a real `requestAnimationFrame` boundary. jsdom has no paint/frame concept at all. |
| `tests/compiled-output-parity.spec.ts` | The SAME `.uix`-compiled JS artifact (compiled once via the real `UiCompiler` + esbuild pipeline, mirroring swite/the Vite plugin) executed in three different DOM implementations. FABLE-CROSS-001 s6 audited the compiler's output by static inspection only and explicitly flagged execution parity as unverified; this is that verification. |

## What this deliberately does NOT cover

- **iOS Safari.** Playwright's `webkit` project is the WebKit **engine**, not iOS Safari. It does
  not reproduce the dynamic toolbar, the home indicator, or iOS's real input-focus behaviour --
  precisely the surface FABLE-CROSS-001 identified as highest-risk and least-handled. This
  harness catches **engine** divergence; a real device is still required pre-release
  (FABLE-CROSS-001 §7, "Pre-release" row).
- **Reconciliation correctness beyond the covered shapes.** `runtime/src/__tests__/ssr-hydration-round-trip.test.ts`'s
  third case (index-derived hydration identity leaking a stale attribute across a list-position
  shift) is a known, filed gap pending FRAME-001 -- it is not re-asserted here as "fixed."
- **Full application flows.** This is the framework-tier conformance suite (CROSS-001-B). An
  application-level smoke suite in Blink + WebKit is tracked separately as `CROSS-001-F`.
- **Gecko/WebKit-specific CSS** (`-webkit-scrollbar`, `100vh`/`100dvh`, safe-area insets). Those
  are application-layer remediation, tracked as `CROSS-001-D` / `CROSS-001-E`.

## Architecture

- `server/static-server.mjs` -- dependency-free Node `http` server. No reusable "serve a build"
  utility exists elsewhere in this repo (checked `cli/src/server/unified-server.ts`, which is
  CLI-scoped Express machinery, and `runtime/src/runtime/dev-server.ts`, which delegates to the
  external `@swissjs/swite` package this repo cannot resolve standalone). Serves `runtime/dist`
  under `/dist/`, runs each fixture's real `renderToString()` server-side on request, and returns
  an HTML document that loads the client half via a native `<script type="module">` + import map
  -- the same browser-native ESM loading path the shipped product uses.
- `server/compile-fixtures.mjs` -- compiles `fixtures/Greeting.uix` once (via `global-setup.mjs`,
  before any project runs) through `UiCompiler.compileAsync()` + esbuild, mirroring
  `plugins/vite/__tests__/parity.test.ts`'s `compileLikeSwite()` exactly.
- `fixtures/*.component.mjs` -- real `SwissComponent` subclasses, shared verbatim between the
  server (SSR) and client (hydrate/mount) halves of each test, so both sides are provably testing
  the same code.
- `playwright.config.ts` -- three projects (chromium/webkit/firefox), one shared `webServer`.

## Dependency Review Record (DRR)

See the PR body for the full record. Summary: `@playwright/test`, pinned to `1.61.1` (last stable
release supporting Node 18 -- this repo's `engines` field is `>=18.19.0 <19`; Playwright 1.62+
requires Node 20), self-hosted, `devDependency`, scoped to this package only.
