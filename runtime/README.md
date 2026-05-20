# @swissjs/core

The SwissJS runtime. Component model, reactivity, virtual DOM renderer, context system, security gateway, devtools bridge, and JSX runtime.

---

## Exports Overview

```typescript
import {
  // App mounting
  SwissApp, SwissFramework, mount,

  // Component base
  SwissComponent,            // primary base class for all components
  BaseComponent,             // low-level base (SwissComponent extends this)

  // Reactivity
  Signal,                    // standalone reactive value
  reactive,                  // Proxy-based reactive object
  createEffect,              // run a function reactively
  batch,                     // batch multiple signal writes

  // Hooks
  onMount, onUnmount, onEffect,

  // Context
  SwissContext,

  // Renderer
  renderToDOM, renderToString, hydrate,

  // VNode utilities
  html, css, classNames, escapeHTML, unsafe,

  // Security gateway
  setSecurityGateway, evaluateCapability, audit, auditPlugin,

  // Error boundaries
  ErrorBoundary, createErrorBoundary,

  // Devtools
  getDevtoolsBridge, setDevtoolsBridge,

  // Fenestration (portals)
  // ...

  // JSX
  jsx, jsxs, JSXFragment,
} from '@swissjs/core';
```

---

## Component Model

### SwissComponent

All components ultimately extend `SwissComponent` (which extends `BaseComponent`). When writing Swiss syntax, the compiler generates this extension automatically.

```typescript
import { SwissComponent } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

interface State { count: number }

export class Counter extends SwissComponent<{}, State> {
  override handleMount(): void {
    this.setState({ count: 0 });
  }

  override handleDestroy(): void {
    // cleanup
  }

  increment(): void {
    this.setState(s => ({ count: s.count + 1 }));
  }

  override render(): VNode {
    return html`<button onclick="${() => this.increment()}">${this.state.count}</button>`;
  }
}
```

### Lifecycle methods

| Method | When it runs |
|---|---|
| `handleMount()` | After the component is inserted into the DOM |
| `handleUpdate()` | After any state change triggers a re-render |
| `handleDestroy()` | Before the component is removed from the DOM |
| `captureError(error, phase)` | When an error is thrown during any phase |

### `setState()`

Accepts either an updater function or a partial state object. Only changed keys trigger re-renders — unchanged keys are skipped.

```typescript
this.setState({ count: 5 });
this.setState(s => ({ count: s.count + 1 }));
```

State is a `reactive()` Proxy — mutations to nested objects also trigger updates.

### Static class fields

| Field | Purpose |
|---|---|
| `static requires: string[]` | Capability requirements checked at mount time |
| `static contextType?: symbol` | Context type for automatic injection |
| `static isErrorBoundary: boolean` | Mark component as error boundary |
| `static propTypes` | Prop type metadata (set by compiler from `props = {}`) |

---

## Reactivity

### Signal\<T\>

Standalone reactive value with automatic effect tracking.

```typescript
import { Signal } from '@swissjs/core';

const count = new Signal(0);

// Reading inside an effect tracks the dependency
count.value;

// Writing notifies all subscribers
count.value = 5;

// Options
const named = new Signal(0, { name: 'count', equals: Object.is });
const secured = new Signal(0, { capability: 'admin' });
```

`Signal` is also what the compiler generates for `state { let x: T = v }` blocks — the Signal is private to the component, accessed via generated getter/setter.

### `reactive(obj)`

Wraps a plain object in a Proxy that notifies all active effects on any property write. Used internally by `BaseComponent` for the `state` object.

```typescript
import { reactive } from '@swissjs/core';

const state = reactive({ count: 0, name: 'Swiss' });
state.count = 1; // triggers any active effects
```

### `createEffect(fn)`

Runs `fn` immediately and re-runs it any time a Signal or reactive property read inside `fn` changes.

```typescript
import { createEffect, Signal } from '@swissjs/core';

const count = new Signal(0);
createEffect(() => {
  console.log('count is', count.value);
});
count.value = 1; // logs "count is 1"
```

### `batch(fn)`

Defers signal notifications until `fn` completes — prevents multiple re-renders when updating multiple signals.

```typescript
import { batch } from '@swissjs/core';

batch(() => {
  signalA.value = 1;
  signalB.value = 2;
}); // renders once
```

---

## Context

```typescript
import { SwissContext } from '@swissjs/core';

// Define
export interface ThemeCtx { theme: 'light' | 'dark' }
export const ThemeContext = new SwissContext<ThemeCtx>('theme');

// Provide (inside a render method)
return ThemeContext.provide({ theme: 'dark' }, children, this);

// Consume (inside a render method)
const { theme } = ThemeContext.use(this);
```

---

## Rendering

### `SwissApp.mount(Component, element)`

Entry point for mounting a component tree to the DOM.

```typescript
import { SwissApp } from '@swissjs/core';
import { App } from './App.ui';

SwissApp.mount(App, document.querySelector('#app')!);
```

### `renderToDOM(vnode, element)`

Low-level DOM renderer. Used internally by `SwissApp.mount`.

### `renderToString(vnode)`

SSR: serializes a VNode tree to an HTML string.

### `hydrate(vnode, element)`

SSR: attaches event listeners to server-rendered HTML without re-creating DOM nodes.

### `html` tagged template

Produces a `VNode` from a template literal. Handles nested VNodes, event bindings, and arrays.

```typescript
render() {
  return html`
    <div class="card">
      <h1>${this.title}</h1>
      ${this.items.map(item => html`<li>${item.name}</li>`)}
    </div>
  `;
}
```

---

## Security Gateway

`@swissjs/core` does not implement security — it holds a gateway slot that `@swissjs/security` fills at app startup.

```typescript
import { setSecurityGateway, evaluateCapability } from '@swissjs/core';
import { InMemorySecurityEngine } from '@swissjs/security';

setSecurityGateway(new InMemorySecurityEngine());

// Check capability (returns true if no gateway is set)
evaluateCapability('admin', { layer: 'component', componentName: 'Dashboard' });
```

The `@requires('capability')` decorator (or `static requires = ['capability']`) causes `evaluateCapability` to be called at mount time, blocking the component if the capability is absent.

---

## Error Boundaries

```typescript
import { ErrorBoundary } from '@swissjs/core';

// As a base class
class MyBoundary extends ErrorBoundary {
  renderError(error: unknown): VNode {
    return html`<div class="error">Something went wrong</div>`;
  }
}
```

---

## Devtools Bridge

```typescript
import { setDevtoolsBridge, InMemoryBridge } from '@swissjs/core';

// Enable devtools in development
if (import.meta.env.DEV) {
  setDevtoolsBridge(new InMemoryBridge());
}
```

The bridge emits component lifecycle events consumed by the SwissJS devtools browser extension.

---

## JSX Runtime

`.uix` files compile with `jsxImportSource: '@swissjs/core'`. The JSX runtime exports are at:

- `@swissjs/core/jsx-runtime` — production (`jsx`, `jsxs`, `Fragment`)
- `@swissjs/core/jsx-dev-runtime` — development
