# Quickstart

Get a SwissJS app running locally in under five minutes.

---

## Prerequisites

- Node.js 18.19.x or later
- pnpm 10.x (`npm install -g pnpm`)

---

## 1. Scaffold a new project

```bash
npm create swissjs@latest my-app
cd my-app
pnpm install
```

---

## 2. Start the dev server

```bash
swiss dev
```

Opens at `http://localhost:3000`. HMR is enabled for `.ui` and `.uix` files.

---

## 3. Project layout

```
my-app/
├── src/
│   ├── main.ui          # app entry — mounts root component
│   ├── App.ui           # root component
│   └── components/      # your components
├── public/              # static assets
├── package.json
└── swissjs.config.ts    # optional config
```

---

## 4. Write your first component

```typescript
// src/components/Counter.ui

component Counter {
  state {
    let count: number = 0;
  }

  computed get doubled() {
    return this.count * 2;
  }

  mount {
    console.log('Counter ready');
  }

  render() {
    return html`
      <div>
        <p>Count: ${this.count} (doubled: ${this.doubled})</p>
        <button onclick="${() => this.count++}">+1</button>
        <button onclick="${() => this.count--}" disabled="${this.count === 0}">-1</button>
      </div>
    `;
  }
}
```

---

## 5. Mount it

```typescript
// src/main.ui
import { SwissApp } from '@swissjs/core';
import { Counter } from './components/Counter.ui';

SwissApp.mount(Counter, document.querySelector('#app')!);
```

---

## 6. Build for production

```bash
swiss build
```

Output goes to `dist/`. Serves with any static host or:

```bash
swiss serve        # local preview of the production build
```

---

## Next

- [Project structure](./project-structure.md) — layout conventions and configuration
- [Components and lifecycle](../concepts/components-and-lifecycle.md) — component API deep-dive
- [Reactivity model](../concepts/reactivity-model.md) — Signals and effects
- [CLI reference](../cli/index.md) — all `swiss` commands
