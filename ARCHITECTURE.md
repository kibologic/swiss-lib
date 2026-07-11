# Architecture

SwissJS is a TypeScript-first web framework with its own syntax, compiler, and dev server.

## Package map

```
swiss-lib/
├── runtime/    @swissjs/core       — component model, reactivity, renderer
├── compiler/   @swissjs/compiler   — .ui/.uix syntax transformer, compilation pipeline
├── router/     @swissjs/router     — client-side routing, SSR
├── components/ @swissjs/components — base UI component library
├── security/   @swissjs/security   — security engine, policies, rate limiting
├── cli/        @swissjs/cli        — `swiss` CLI (dev, build, create, compile, serve)
├── shared/     @swissjs/shared     — internal utilities shared across packages
├── language/   —                   — language spec: grammar, AST contracts, LSP
├── internal/   —                   — internal build tooling
└── plugins/
    ├── file-router/  @swissjs/plugin-file-router
    ├── web-storage/  @swissjs/plugin-web-storage
    └── vite/         @swissjs/vite-plugin — Vite plugin for .ui/.uix compilation
```

## Compilation pipeline

```
.ui / .uix source
      │
      ▼
  @swissjs/compiler
  ├── parser      — tokenises Swiss syntax, builds AST
  ├── transformer — converts component {} / state {} / JSX to standard TS
  └── emitter     — outputs ES module JS
      │
      ▼
  browser-ready ES module
```

## File extensions

- `.ui` — module-level SwissJS files (shell pages, top-level components)
- `.uix` — component-scoped SwissJS files (isolated components, no module-level declarations)

## Component model

Components are declared with `component Name { }`. State is declared with `state { let x }`. Reactivity is fine-grained — only state that changes triggers a re-render.

## Swite dev server

`@swissjs/swite` is the development server. It compiles `.ui`/`.uix` files on demand via Swite middleware and serves the SPA with HMR.

See `docs/` for detailed package documentation.
