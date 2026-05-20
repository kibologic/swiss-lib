# @swissjs/core — docs

Supplementary documentation for the core runtime package. For the package README see [`runtime/README.md`](../README.md).

---

## In this directory

| File | Contents |
|---|---|
| `component.md` | Deep-dive on `BaseComponent` and `SwissComponent` internals |
| `life-cycle-hooks.md` | Lifecycle hook sequence and timing guarantees |
| `observable-signals.md` | Signal implementation details and advanced usage |
| `ssr-system.md` | Server-side rendering pipeline |
| `SSR_Hydration_Documentation.md` | Hydration protocol and edge cases |
| `error-boundary.md` | Error boundary component model |

---

## Package structure

```
runtime/src/
├── component/       # SwissComponent, BaseComponent, decorators, context, lifecycle, portals
├── reactivity/      # Signal, reactive(), effect(), batch(), store
├── renderer/        # VDOM reconciler, DOM creation, hydration, render cache
├── framework/       # SwissApp, SwissFramework, app.ts, version.ts
├── hooks/           # onMount, onUnmount, onEffect hooks
├── security/        # CapabilityManager, gateway.ts (delegates to @swissjs/security)
├── devtools/        # DevtoolsBridge, InMemoryBridge, event types
├── fenestration/    # Portal registry
├── error/           # ErrorReporter, createErrorBoundary
├── runtime/         # RuntimeService, DevServerService
├── vdom/            # VNode types, vdom.ts
├── utils/           # html, css, classNames, escapeHTML, logger, PerfTimer
├── types/           # routing types, shared type declarations
├── browser.ts       # browser-only entry point
├── jsx-runtime.ts   # jsx, jsxs, Fragment
└── jsx-dev-runtime.ts
```
