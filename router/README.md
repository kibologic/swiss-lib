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
