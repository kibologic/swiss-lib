# @swissjs/router

Client-side routing and server-side rendering for SwissJS applications.

---

## Installation

```bash
pnpm add @swissjs/router
```

---

## Client-side routing

### `Router`

```typescript
import { Router } from '@swissjs/router';
import { Home } from './routes/Home.ui';
import { About } from './routes/About.ui';
import { UserProfile } from './routes/user/[id].ui';

const router = new Router({
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/user/:id', component: UserProfile },
  ],
  mode: 'history',  // 'history' | 'hash'
  base: '/',
});
```

### Navigation

```typescript
// Programmatic navigation
await router.push('/about');
await router.replace('/user/42');
```

### Navigation guards

```typescript
router.beforeEach(async (to, from) => {
  if (to.startsWith('/admin') && !isAuthenticated()) {
    return '/login';     // redirect
  }
  return true;           // allow
});
```

### History stack: `back()` / `forward()` / `go()`

Every `Router` keeps an ordered stack of visited entries plus a current index, kept
consistent with the browser's own back/forward buttons -- calling `router.back()` and the
user clicking the native back button land on the same place, whichever happens first.

```typescript
router.entries;        // readonly HistoryEntry[] -- { path, params, state? }
router.historyIndex;   // number -- index of the current entry within `entries`
router.canGoBack;      // boolean
router.canGoForward;   // boolean

await router.back();     // go(-1)
await router.forward();  // go(1)
await router.go(-2);     // jump multiple entries at once

// Pushing after a back() truncates the forward branch, same as a real browser tab.
await router.push('/a');
await router.push('/b');
await router.back();     // now on /a, /b still in `entries`
await router.push('/c'); // /b is discarded; entries are now [/, /a, /c]
```

`back()`/`forward()`/`go()` resolve immediately as a no-op when the target index is out of
range (e.g. `forward()` with nothing ahead). In a browser environment they drive native
`history.go()` under the hood and resolve once the resulting `popstate` has been processed,
so the two never disagree -- including when the user's *own* back/forward-button click
(bypassing the router's API entirely) fires a native `popstate`.

### Per-entry state + pluggable persistence

`push()`/`replace()` accept an optional `state` payload -- any serializable value -- attached
to that entry. `onStateRestore()` fires with the target entry's `state`, verbatim, whenever
the router lands back on an existing entry (`back()`/`forward()`/`go()`, a native browser
back/forward, or a successful restore from a `historyAdapter` on construction). It is never
fired for a fresh `push()`.

```typescript
await router.push('/books/42', { state: { scrollY: 480 } });

const unsubscribe = router.onStateRestore((entry) => {
  restoreScrollPosition(entry.state as { scrollY: number });
});

await router.back();  // -> onStateRestore fires with { scrollY: 480 }

// Update the current entry's state without navigating (e.g. on scroll):
router.setEntryState({ scrollY: window.scrollY });
```

The router never hard-codes a storage backend. Persistence is entirely opt-in through a
`HistoryStateAdapter` passed as `historyAdapter` in `RouterOptions` -- supply your own
(server-backed, `sessionStorage`, IndexedDB, a no-op for tests, ...):

```typescript
import type { HistoryStateAdapter } from '@swissjs/router';

const sessionStorageAdapter: HistoryStateAdapter = {
  save(entries, index) {
    sessionStorage.setItem('nav-history', JSON.stringify({ entries, index }));
  },
  load() {
    const raw = sessionStorage.getItem('nav-history');
    return raw ? JSON.parse(raw) : null;
  },
};

const router = new Router({ routes, historyAdapter: sessionStorageAdapter });
await router.ready; // resolves once historyAdapter.load() has been applied, if configured
```

### `RouterLink` component

```typescript
import { RouterLink } from '@swissjs/router';

// In a component render
return html`
  <nav>
    <${RouterLink} to="/">Home</${RouterLink}>
    <${RouterLink} to="/about">About</${RouterLink}>
  </nav>
`;
```

### `RouterOutlet` component

Renders the matched route's component at the current URL:

```typescript
import { RouterOutlet } from '@swissjs/router';

// In your App component
return html`
  <nav>...</nav>
  <main>
    <${RouterOutlet} router="${router}" />
  </main>
`;
```

---

## File-based routing

For automatic route generation from the file system, use `@swissjs/plugin-file-router`. See [plugins/file-router/README.md](../plugins/file-router/README.md).

---

## Server-side rendering

### `serverRenderer`

Renders a component tree to an HTML string for SSR:

```typescript
import { serverRenderer } from '@swissjs/router';
import { App } from './App.ui';

const html = await serverRenderer.renderToString(App, { url: '/about' });
```

### `hydrate`

Attaches event listeners to server-rendered HTML on the client:

```typescript
import { hydrate } from '@swissjs/router';
import { App } from './App.ui';

hydrate(App, document.querySelector('#app')!);
```

---

## API routes

```typescript
import { apiHandler, apiScanner } from '@swissjs/router';

// Register an API route handler
apiHandler.register('GET', '/api/users', async (req) => {
  const users = await db.getUsers();
  return Response.json(users);
});
```

---

## Exports

```typescript
import {
  Router,
  RouterLink,
  RouterOutlet,
  StatefulRouter,
  serverRenderer,
  hydrate,
  apiHandler,
  apiScanner,
} from '@swissjs/router';

import type {
  Route,
  RouterOptions,
  NavigationGuard,
  RouteMatch,
} from '@swissjs/router';
```
