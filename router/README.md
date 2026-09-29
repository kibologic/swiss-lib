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

### Per-route guards

A `guard` on a `Route` is checked only when that route -- or one of its descendants -- is
the actual navigation target, after the router's global `beforeEach()` guards. Same
block/redirect contract: `false` blocks, a string redirects, anything else allows.

```typescript
const router = new Router({
  routes: [
    {
      path: '/admin',
      component: AdminLayout,
      guard: (to) => (isAdmin() ? true : '/forbidden'),
      children: [{ path: 'users', component: AdminUsers }],
    },
    { path: '/public', component: Public }, // never triggers the /admin guard
  ],
});
```

### Lazy-loaded routes

Wrap a dynamic import with `lazy()` and `Outlet` loads it on first render, showing an
`outlet-lazy-pending` placeholder until it resolves (`outlet-lazy-error` if the import
rejects -- it is never thrown):

```typescript
import { lazy } from '@swissjs/router';

const router = new Router({
  routes: [
    { path: '/', component: Home },
    { path: '/settings', component: lazy(() => import('./Settings.ui').then((m) => m.Settings)) },
  ],
});

// Optional: preload ahead of navigating there, so Outlet renders it resolved immediately.
import { preloadLazy } from '@swissjs/router';
await preloadLazy(settingsRoute.component); // only if settingsRoute.component is a LazyComponent
```

A bare `() => Promise<ComponentLike>` is not accepted directly as `Route.component` --
a plain function is already a valid component in this framework (`(props) => VNode`), so
`lazy()`'s wrapper is what makes "this is a loader, not a component" unambiguous.

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

### Restoring history against the live browser

A `historyAdapter` snapshot can come from another tab, device, or browser session, so the
router reconciles it with the browser it is actually running in (ROUTER-HISTORY-RESTORE):

- **The URL the browser is on always wins for the current entry.** Paths keep their query
  string everywhere (`push`, `replace`, popstate, persistence). `currentPath` is
  `pathname + search`; route matching uses the pathname only.
- **Same-tab reload:** if the native `history.state` carries a `__swissRouterIndex` that
  names a snapshot entry whose path (and query) equals `location`, the snapshot and that
  index are adopted and the marker is not re-tagged, so back/forward land on the exact
  indices.
- **Otherwise (new tab, new device, browser restart, or a mismatch):** the snapshot entries
  stay as the stack's back-history, so the user can go back across devices. If the snapshot's
  current entry is not the current location, the location is appended after it (forward
  entries are dropped) and becomes the top entry. Entries this tab never visited are
  *restored-only*: `back()`/`forward()`/`go()` onto them navigate with `replaceState` and
  re-render instead of awaiting a native `popstate` that could never arrive, and always
  resolve. `canGoBack`/`canGoForward` reflect the router's stack.
- **Bounded:** the stack holds at most `MAX_HISTORY_ENTRIES` (200) entries; the oldest are
  dropped first, in memory and in what is persisted.

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

### Not-found routes

Configure `notFound` and `Outlet` renders it whenever no route matches the current path,
instead of an empty `<div class="outlet-empty">`:

```typescript
const router = new Router({
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ],
  notFound: NotFoundPage,
});
```

### Nested-route params are merged

`Outlet` passes the merged params from every level of the matched chain to the leaf
component, not just the leaf's own params. `/teams/:teamId` with a `members/:memberId`
child, navigated to `/teams/eng/members/42`, renders the child with
`{ teamId: 'eng', memberId: '42' }`. The merge is also available directly via
`mergeParams(matches)` (exported alongside `matchRoute`) for any other consumer of
`router.match()`.

### Splat (catch-all) segments

A route whose **final** segment starts with `*` captures the whole remainder of the path --
one or more segments -- as a single param. `/docs/*path` matches `/docs/a`, `/docs/a/b/c`,
and so on, with `params.path` set to `'a'`, `'a/b/c'`, ... A bare `*` captures under the
param name `'*'`.

```typescript
const router = new Router({
  routes: [
    { path: '/docs', component: DocsIndex },       // the empty remainder is its own route
    { path: '/docs/*path', component: DocsPage },  // params.path === 'a/b/c'
  ],
});
```

- **Empty remainder does not match.** `/docs` (and `/docs/`) is not matched by `/docs/*path`;
  declare `/docs` as its own route, as above. This keeps "the index" and "a page" as
  distinct routes rather than a page with an empty name.
- **Precedence.** Among siblings a splat is always tried last, whatever the declaration
  order, so it never shadows a static or `:param` route. `/docs/intro` and `/docs/:id` win
  over `/docs/*path` for one-segment paths; deeper paths fall through to the splat.
- **Encoding.** Like `:param`, the value is the raw URL text: the router does not decode.
  `/docs/a%20b/c` gives `'a%20b/c'`; a trailing slash is ignored. Decode in the consumer.
- **Must be last.** A splat anywhere but the final segment (`/a/*x/b`) throws when matched.
  A splat route is a leaf; it does not take `children`. Nested routes may end in a splat
  (`wiki/*page` under `/teams/:teamId`), and `mergeParams` includes it.

---

## File-based routing

For automatic route generation from the file system, use `@swissjs/plugin-file-router`. See [plugins/file-router/README.md](../plugins/file-router/README.md).

---

## Entry points

The package has two entry points. The main entry is **browser-safe** (nothing reachable from
it imports a Node built-in, enforced by `tests/browser-entry.test.ts`); server-only modules
live under `/server`.

```typescript
// browser + server
import {
  Router,
  StatefulRouter,
  Outlet,
  Link,
  lazy,
  matchRoute,
  mergeParams,
  hydrate,
  getServerData,
} from '@swissjs/router';
import type { Route, RouterOptions, RouteMatch } from '@swissjs/router';

// Node only -- never import from browser code
import {
  ServerRenderer,
  createServerRenderer,
  APIRouteHandler,
  createAPIHandler,
  APIRouteScanner,
  createAPIScanner,
} from '@swissjs/router/server';
```

**Migration (breaking for Node consumers of the barrel):** `ServerRenderer`,
`createServerRenderer`, `SSRContext`, `SSRResult`, the API handler exports and the API
scanner exports are no longer exported from `@swissjs/router`; import them from
`@swissjs/router/server`. The dead `"module": "dist/index.mjs"` field was removed (the build
only emits `dist/index.js`).

---

## Server-side rendering

### `createServerRenderer`

Renders the matched route tree to an HTML string for SSR:

```typescript
import { createRouter } from '@swissjs/router';
import { createServerRenderer } from '@swissjs/router/server';

const router = createRouter({ routes });
const { html } = await createServerRenderer(router).render('/about');
```

### `hydrate`

Attaches the client to server-rendered HTML (main entry, safe in the browser):

```typescript
import { hydrate } from '@swissjs/router';

hydrate(document.querySelector('#app')!, data);
```

---

## API routes

```typescript
import { createAPIHandler, createAPIScanner } from '@swissjs/router/server';
```

`APIRouteHandler` registers and dispatches API routes; `APIRouteScanner` discovers route
files from the file system (which is why it is server-only).
