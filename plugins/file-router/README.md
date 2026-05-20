# @swissjs/plugin-file-router

File-system-based routing plugin for SwissJS. Generates a route table from a `src/routes/` directory and registers it with the `@swissjs/router` client-side router.

---

## Installation

```bash
pnpm add @swissjs/plugin-file-router
```

---

## Setup

```typescript
import { SwissFramework } from '@swissjs/core';
import { fileRouterPlugin } from '@swissjs/plugin-file-router';

const framework = SwissFramework.getInstance();

framework.plugins.register(
  fileRouterPlugin({
    routesDir: './src/routes',
    extensions: ['.ui', '.uix'],
    layouts: true,
    lazyLoading: true,
  }),
);

framework.initialize();
```

---

## File structure

Files in `routesDir` map to URL paths by name:

```
src/routes/
├── index.ui          # → /
├── about.ui          # → /about
├── user/
│   ├── index.ui      # → /user
│   └── [id].ui       # → /user/:id  (dynamic segment)
└── admin/
    ├── index.ui      # → /admin
    └── settings.ui   # → /admin/settings
```

### Dynamic segments

Files named `[param].ui` generate a dynamic route segment (`:param` in the router). Catch-all: `[...rest].ui` → `*`.

---

## Route files

Each route file exports a default SwissJS component. The plugin maps the file to the route path and passes the component to the router.

```typescript
// src/routes/about.ui

component AboutPage {
  render() {
    return html`<h1>About</h1>`;
  }
}
```

For routes with async data loading:

```typescript
// src/routes/user/[id].ui

component UserProfile {
  state {
    let user: User | null = null;
  }

  async mount() {
    const id = this.props.params.id;
    this.user = await fetchUser(id);
  }

  render() {
    if (!this.user) return html`<p>Loading…</p>`;
    return html`<h1>${this.user.name}</h1>`;
  }
}
```

---

## Layouts

Place layout components in `src/layouts/`. The plugin wraps matched routes in the appropriate layout:

```typescript
// src/layouts/AppLayout.ui

component AppLayout {
  render() {
    return html`
      <header>...</header>
      <main>${this.props.children}</main>
      <footer>...</footer>
    `;
  }
}
```

---

## Configuration

```typescript
interface FileRouterOptions {
  routesDir?: string;         // default: './src/routes'
  extensions?: string[];      // default: ['.ui', '.uix']
  layouts?: boolean;          // default: true
  lazyLoading?: boolean;      // default: true
  preloading?: boolean;       // default: false
  transform?: (path: string) => string;  // custom path mapping
  dev?: {
    hotReload?: boolean;
  };
}
```

---

## Exports

```typescript
import { fileRouterPlugin } from '@swissjs/plugin-file-router';

// Internals (advanced use)
import { RouteScanner, RouteMatcher, PathTransformer } from '@swissjs/plugin-file-router';

import type { FileRouterOptions, RouteConfig } from '@swissjs/plugin-file-router';
```

---

## Performance

- Route resolution: >10,000 matches/ms (LRU cache)
- Bundle size: <3 kB gzipped
- Startup: <50 ms for 1,000 routes
