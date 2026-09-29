---
"@swissjs/router": minor
---

Make the main entry browser-safe (ROUTER-BROWSER-ENTRY). `@swissjs/router` re-exported
`./api/scanner`, which imports `node:fs`/`node:path`/`node:url`, so a browser
`import('@swissjs/router')` failed to load. The server-only modules (`ServerRenderer` /
`createServerRenderer`, the API handler and the API scanner) now live behind
`@swissjs/router/server`; the main entry keeps the router core, `StatefulRouter`, `Outlet`,
`Link`, `lazy` and `hydrate`. `package.json` gains an `exports` map (with `types`) for both
entry points and drops the `"module": "dist/index.mjs"` field, which the build never emitted.

BREAKING for Node consumers that import the server exports from the barrel: change
`import { createServerRenderer } from '@swissjs/router'` to
`from '@swissjs/router/server'` (same for `ServerRenderer`, `SSRContext`, `SSRResult`,
`APIRouteHandler`, `createAPIHandler`, `APIRouteScanner`, `createAPIScanner`, `APIRoute*`
types). Bump is `minor`, not `major`: a survey of swiss-lib and the alpine-core,
business-alpine, alpine-shell, hospitality-alpine, swite, examples and create-swissjs clones
found no imports of these exports (alpine repos only pin the package in pnpm overrides), and
a `major` would drag the whole linked `@swissjs/*` set to 2.0.0. Maintainers may raise it.
