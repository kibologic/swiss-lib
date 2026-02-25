# SwissJS Framework (`swiss-lib`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **"We got tired of waiting for someone else to build it."**
>
> A modern, capability-based web framework built TypeScript-first with its own custom syntax, compiler, and dev server. We just wanted fast software.

---

## What's in this repo?

| Package | Description |
|---|---|
| `@swissjs/core` | Core framework runtime (component model, reactivity, context, rendering) |
| `@swissjs/compiler` | Compile-time transformations for `.ui` and `.uix` files |
| `@swissjs/components` | Base UI component library |
| `@swissjs/router` | Client-side routing & SSR support |
| `@swissjs/cli` | Command-line tooling |
| `@swissjs/css` | CSS processing utilities |
| `@swissjs/devtools` | Browser & VSCode extensions |
| `@swissjs/plugins` | First-party plugins (web storage, file router) |

---

## File Extensions

SwissJS uses two custom file extensions:

- `.ui` — TypeScript logic, utilities, types (no JSX)
- `.uix` — TypeScript + JSX for defining UI components (like `.tsx` but Swiss-flavored)

---

## Writing a Component

Components extend `SwissComponent` from `@swissjs/core`:

```typescript
// Counter.uix
import { SwissComponent } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

interface CounterState extends Record<string, unknown> {
  count: number;
}

export class Counter extends SwissComponent<{}, CounterState> {
  override handleMount(): void {
    this.setState({ count: 0 });
  }

  increment(): void {
    this.setState({ count: (this.state.count ?? 0) + 1 });
  }

  override render(): VNode {
    return (
      <div>
        <h1>Count: {this.state.count}</h1>
        <button onClick={() => this.increment()}>+1</button>
      </div>
    );
  }
}
```

---

## Mounting an App

```typescript
// index.ui
import { SwissApp } from '@swissjs/core';
import { Counter } from './Counter.uix';

SwissApp.mount(Counter, document.querySelector('#app')!);
```

---

## Context API

SwissJS provides a built-in context system for sharing state across the component tree:

```typescript
// MyContext.ui
import { SwissContext } from '@swissjs/core';

export interface MyContextValue {
  theme: 'light' | 'dark';
}

export const MyContext = new SwissContext<MyContextValue>('my-context');
```

Provider:

```typescript
// MyProvider.uix
import { SwissComponent } from '@swissjs/core';
import { MyContext } from './MyContext.ui';

export class MyProvider extends SwissComponent<{ children?: unknown }, {}> {
  override render() {
    return MyContext.provide({ theme: 'dark' }, this.props.children, this);
  }
}
```

Consumer:

```typescript
const value = MyContext.use(this); // inside a render() method
```

---

## Dev Server

`swiss-lib` uses [`swite`](https://github.com/kibologic/swite) as its development server and build tool. Make sure `swite` is cloned alongside this repo and linked via pnpm.

```bash
# Clone both repos
git clone https://github.com/kibologic/swiss-lib
git clone https://github.com/kibologic/swite

# Install and link
cd swiss-lib
pnpm install
pnpm dev
```

---

## Contributing

See [CONTRIBUTING.md](https://github.com/kibologic/.github/blob/main/CONTRIBUTING.md) in the org-wide `.github` repo.

## Security

See [SECURITY.md](https://github.com/kibologic/.github/blob/main/SECURITY.md) for vulnerability reporting.

## License

[MIT](https://github.com/kibologic/.github/blob/main/LICENSE)
