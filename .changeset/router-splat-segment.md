---
"@swissjs/router": minor
---

Add catch-all route segments (ROUTER-SPLAT-SEGMENT). A final `*name` segment
(`/docs/*path`) captures one or more remaining segments as a single slash-joined, undecoded
param (`/docs/a/b/c` gives `params.path === 'a/b/c'`); a bare `*` uses the name `'*'`. The
empty remainder does not match (`/docs` needs its own route), a splat is always tried after
its static and `:param` siblings regardless of declaration order, and a splat that is not the
final segment throws when matched.
