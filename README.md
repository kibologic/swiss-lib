# swiss-lib

The SwissJS framework monorepo. TypeScript-first web framework with its own syntax, compiler, and dev server.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Packages

| Directory | Package | Version | Description |
|---|---|---|---|
| `runtime/` | `@swissjs/core` | 0.1.5 | Component model, reactivity, renderer, context, security gateway |
| `compiler/` | `@swissjs/compiler` | 0.1.4 | Swiss syntax transformer and `.ui`/`.uix` compilation pipeline |
| `shared/` | `@swissjs/shared` | 0.1.15 | Internal utilities shared across packages |
| `router/` | `@swissjs/router` | 0.1.4 | Client-side routing and SSR |
| `css/` | `@swissjs/css` | 0.1.4 | CSS modules and asset handling |
| `components/` | `@swissjs/components` | 0.1.4 | Base UI component library |
| `security/` | `@swissjs/security` | 0.1.13 | Security engine, policies, rate limiting, validation middleware |
| `cli/` | `@swissjs/cli` | 0.1.6 | `swiss` CLI — dev, build, create, compile, serve |
| `plugins/file-router/` | `@swissjs/plugin-file-router` | 1.0.2 | File-system-based routing plugin |
| `plugins/web-storage/` | `@swissjs/plugin-web-storage` | 0.1.2 | Reactive Web Storage plugin |
| `language/` | — | scaffold | Language specification (grammar, AST contracts, LSP contracts) |
| `internal/` | — | scaffold | Internal build tooling |

---

## File Extensions

SwissJS uses two custom file extensions:

| Extension | Purpose |
|---|---|
| `.ui` | TypeScript logic, utilities, types, and components using `html\`\`` templates |
| `.uix` | TypeScript + JSX for components that render with JSX syntax |

Both extensions receive Swiss syntax sugar through the compiler. `.uix` additionally runs JSX transformation.

---

## Swiss Syntax

Components are written in Swiss syntax — a TypeScript superset that compiles to class-based TypeScript:

```typescript
// Counter.ui
import { Signal } from '@swissjs/core';

component Counter {
  state {
    let count: number = 0;
    let step: number = 1;
  }

  computed get doubled() {
    return this.count * 2;
  }

  mount {
    console.log('Counter mounted');
  }

  unmount {
    console.log('Counter unmounted');
  }

  effect {
    console.log('count changed:', this.count);
  }

  increment() {
    this.count += this.step;
  }

  render() {
    return html`
      <div>
        <p>Count: ${this.count} (doubled: ${this.doubled})</p>
        <button onclick="${() => this.increment()}">+</button>
      </div>
    `;
  }
}
```

### Swiss keyword reference

| Keyword | Compiles to |
|---|---|
| `component Name {}` | `export class Name extends SwissComponent {}` |
| `state { let x: T = v }` | `Signal<T>`-backed private getter + setter pair |
| `reactive let x: T` | Reactive private property |
| `computed get x()` | Private getter |
| `mount {}` | `mounted()` lifecycle method |
| `unmount {}` | `unmounted()` lifecycle method |
| `effect {}` | `private effect()` method |
| `props = {}` | `static propTypes = {}` (off instance) |
| `@requires('cap')` | Capability decorator (checked at mount time) |

---

## Class API

For advanced use, components can also be written directly as TypeScript classes:

```typescript
// Counter.uix
import { SwissComponent } from '@swissjs/core';
import type { VNode } from '@swissjs/core';

interface State { count: number; }

export class Counter extends SwissComponent<{}, State> {
  override handleMount(): void {
    this.setState({ count: 0 });
  }

  increment(): void {
    this.setState(s => ({ count: s.count + 1 }));
  }

  override render(): VNode {
    return (
      <div>
        <p>Count: {this.state.count}</p>
        <button onClick={() => this.increment()}>+</button>
      </div>
    );
  }
}
```

---

## Mounting an App

```typescript
// main.ui
import { SwissApp } from '@swissjs/core';
import { Counter } from './Counter.ui';

SwissApp.mount(Counter, document.querySelector('#app')!);
```

---

## Context API

```typescript
// theme-context.ui
import { SwissContext } from '@swissjs/core';

export interface ThemeCtx { theme: 'light' | 'dark'; }
export const ThemeContext = new SwissContext<ThemeCtx>('theme');
```

```typescript
// Provider component
override render() {
  return ThemeContext.provide({ theme: 'dark' }, this.props.children, this);
}

// Consumer (inside render())
const { theme } = ThemeContext.use(this);
```

---

## Development Setup

```bash
git clone https://github.com/kibologic/swiss-lib
cd swiss-lib
pnpm install
pnpm build        # build all packages
pnpm test         # run all tests
```

### Running a SwissJS app

The dev server is `@swissjs/swite`, invoked via the CLI:

```bash
# inside a SwissJS app project
swiss dev          # start dev server on :3000
swiss build        # production build
swiss create       # scaffold a new project
```

### Workspace scripts

```bash
pnpm -w lint           # lint all packages
pnpm -w type-check     # type-check all packages
pnpm -w test           # run all tests
pnpm reset             # full clean → install → lint → build → test → docs
```

---

## Branch Strategy

```
feature/* → development → staging → main
```

- `main` — production, tagged releases
- `staging` — pre-production validation
- `development` — feature integration
- `feature/<name>` — working branches off `development`

All merges are no-ff. Push to remote after every commit.

---

## License

[MIT](LICENSE)
