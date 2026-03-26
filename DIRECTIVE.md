# DIRECTIVE — swiss-lib
> Last updated: 2026-03-03 · Owner: Kibologic · Repo: kibologic/swiss-lib · License: MIT

---

## Status
`ACTIVE DEVELOPMENT` — Core packages building. Compiler SG-05 fix shipped. Problem B (reactivity unification) in progress.

---

## Versioning & Release Strategy (locked 2026-03-01)

### Decisions
- Registry: npm public registry (all packages MIT)
- Scope: @swissjs/*
- Cadence: milestone-based tied to Alpine ERP milestones
- Changesets: @changesets/cli, linked versioning
- Pre-v1: publish 0.1.0 NOW to claim npm scope
- Linked packages: all core packages version together
  (core, compiler, router, components, security, utils,
   plugin-file-router, plugin-web-storage)
- Ignored from publish: @swissjs/css (Buffer conflict),
  @swissjs/cli (workspace dep issues)

### Changeset config
File: .changeset/config.json
```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    [
      "@swissjs/core",
      "@swissjs/compiler",
      "@swissjs/router",
      "@swissjs/components",
      "@swissjs/security",
      "@swissjs/utils",
      "@swissjs/plugin-file-router",
      "@swissjs/plugin-web-storage"
    ]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@swissjs/css", "@swissjs/cli"]
}
```

### Pipeline (LIVE — commit 1b6dc41, 2026-03-02)

File: .github/workflows/ci.yml ✓
Trigger: push to main, all PRs
Jobs: pnpm install → pnpm build → pnpm test
      changeset presence check on PRs (warn only)

File: .github/workflows/release.yml ✓
Trigger: push to main
Jobs: changesets/action — creates "Version Packages" PR
      when .changeset/ has entries; publishes to npm
      when version PR is merged (no entries remaining)
      GitHub releases created automatically

File: .github/workflows/publish.yml ✓
Trigger: manual (workflow_dispatch)
Jobs: emergency re-publish with optional dry-run mode

### Secrets required (add to kibologic org on GitHub)
NPM_TOKEN       — npm publish authentication
CHANGESET_TOKEN — PR creation for version bump PRs
GITHUB_TOKEN    — auto-provided by GitHub Actions

### npm org setup (manual — do once)
1. Create @swissjs org on npmjs.com
2. Create @sws org on npmjs.com
3. Generate npm access token
4. Add as NPM_TOKEN secret in kibologic org settings

### Current pipeline status
LIVE — 3 clean workflows shipped (commit 1b6dc41).
18 broken old workflow files deleted.
Secrets still needed in kibologic org GitHub settings:
  NPM_TOKEN (npm publish authentication)
  GITHUB_TOKEN (auto-provided by GitHub Actions)
npm org @swissjs must be created on npmjs.com (manual, one-time).

### Known build exclusions
@swissjs/css    — Buffer type conflict, excluded
                  from turbo via .turboignore
@swissjs/cli    — workspace dep issues, excluded
bun-adapter.ts  — excluded from core tsconfig
                  (Node-only runtime for alpine-erp)

### Brand Rule
SwissJS is a global framework.
Remove any regional labels from all docs and READMEs.

---

## Kibologic Foundational Decisions (locked 2026-03-01)

### Security & Repository Hardening

Signed commits
  Required on main branch in all kibologic repos
  Enforced via branch protection rules
  No unsigned commits merged to main

SECURITY.md
  Required in every public repo
  Contains: security@kibologic.com contact
  Disclosure timeline: 90 days
  CVE process: GitHub Security Advisories

CODEOWNERS
  Required in every repo
  Founder owns everything initially
  Format: * @themba-kibologic
  Expandable as team grows

CodeQL scanning
  Enabled on all PRs in all repos
  GitHub Advanced Security
  Blocks merge if critical vulnerability found

Pre-commit hooks
  Tool: gitleaks
  Blocks commits containing secrets/tokens
  Applied to all repos on dev machines
  Also runs in CI as second layer

### npm & Publishing Security

Automation tokens only for CI publish
Granular access tokens for human use
No local manual publish ever
2FA mandatory on npm org accounts
Unpublish policy: never after public release
Deprecation only via npm deprecate command

### GitHub Org Security

Dependabot enabled all repos
Secret scanning enabled all repos
CodeQL enabled all repos
Branch protection on main — all repos
  Require 1 PR review
  Require status checks to pass
  Dismiss stale reviews
  No admin bypass
CODEOWNERS required before merge

### License & Legal

BSL 1.1 on Alpine ERP and enterprise packages
Change date: 2029-12-31 → Apache 2.0
Trademark intent-to-use filed for:
  SwissJS, Alpine ERP, Swite
CLA required for all external contributors
SECURITY.md in every public repo
BSL notice in repo root AND in every release

### Enterprise License Architecture

Format: signed JSON payload
Algorithm: ed25519
Private key: offline secure storage
Public key: embedded in backend only
Validation: backend only, never frontend only
Frontend role: feature visibility only
Offline validation: supported
Seat enforcement: hard block new user creation
Module enforcement: backend service layer guard
Self-hosted: license file in server env/config
SaaS: database-driven feature flags

### Deployment

Static sites: Cloudflare Pages
  swissjs.dev, alpineerp.com, kibologic.com
SaaS backend: Fly.io or equivalent
Self-hosted: Docker Compose first
Official distribution: Docker image
Database: managed PostgreSQL provider
Kubernetes: not initially

### Domain & Email

All three domains on Cloudflare
SSL: Full strict
www → root redirect
HTTP → HTTPS
DNSSEC enabled
HSTS enabled
Email: Google Workspace or equivalent
Required addresses:
  hello@kibologic.com
  support@kibologic.com
  legal@kibologic.com
SPF, DKIM, DMARC reject policy

### Community & Support

Initial channels: GitHub Issues only
Discord: after measurable traffic
Governance: founder-led
CONTRIBUTING.md required in all repos
Issue templates required in all repos
Public roadmap: high level only
Support: founder-led email/ticket
SLA: 24 business hours response
Private Slack for enterprise:
  optional after revenue threshold
No 24/7 SLA initially

### Documentation

Primary author: founder
Tooling: VitePress or Starlight
Structure:
  getting_started
  core_concepts
  api_reference
  examples
Versioned docs: after v1
Separate docs for SwissJS and Alpine ERP

### Pricing Model

Model: open-core
Free: dashboard, users, settings, pos
Enterprise: finance, hr, inventory,
            sales, procurement
Pricing dimensions: per user + per module
License validation: required (backend)
Self-hosted vs SaaS: different pricing
License key: signed ed25519 JSON

### Versioning & Release

Tool: Changesets (@changesets/cli)
Linked versioning for @swissjs/* core packages
Milestone-based releases

Milestones:
  v0.1.0 — claim npm scopes, publish foundation
  v0.2.0 — PostgreSQL + real data wiring
  v0.3.0 — FastAPI auth complete
  v0.4.0 — first enterprise module real data
  v1.0.0 — first paying customer

Registry split:
  npm public  → @swissjs/*, @sws/*,
                MIT @swiss-package/*
  GitHub Pkg  → BSL @swiss-package/*
  GitHub only → alpine-erp (no npm)

### Brand Rule (non-negotiable)

Kibologic is a global company.
SwissJS, Alpine ERP, Swite are global products.
Remove all regional superlatives from every file.
"Africa's first" or any regional label is wrong.
Correct on sight in every session.

---

## Swiss Gaps
> Framework issues discovered during Alpine ERP development. Each is a swiss-lib task.

### SG-06 — Renderer does not handle null return from render()
**Component:** UpgradeModal (alpine-erp)
**Symptom:** `render()` returning `null` leaves the reactive effect unanchored. On any
parent state change the reconciler re-mounts the component, fires render() again,
gets null again, and cannot clean up — producing an infinite re-render loop.
Secondary issue discovered: V8's `Set.prototype.forEach` creates an infinite loop when an effect deletes and re-adds itself during evaluation.
**Workaround (alpine-erp):** Conditional render guard in Shell so UpgradeModal is
never instantiated when module is null. render() never reaches the null-return path.
**Fix applied:** 
1. `component-rendering.ts` now inserts a hidden `<span data-swiss-null="true">` placeholder when `render()` returns null, giving the reconciler a stable DOM anchor and maintaining instance tracking.
2. `component.ts` now permits `null` returns from `render()` without throwing an error.
3. `signals.ts` now clones the subscribers Set (`Array.from(this.subscribers)`) before iterating in `notify()` to prevent V8 synchronous infinite loops from effect dependency recalculation.
**Status:** FIXED `3a8da04` (2026-03-03)

---

### SG-07 — safeRender() null type contract broken on first mount
**Status:** FIXED (2026-03-26)
**Discovered:** 2026-03-03 (audit after SG-06 fix)
**Component:** any component whose `render()` returns null on first render
**Symptom:** `safeRender()` declares return type `VNode` but `render()` can return null.
`mount()` calls `this.commitVNode(this.safeRender())` directly.
If `render()` returns null on first mount, `commitVNode` receives null —
type contract violated, behaviour undefined.
**Note:** UpgradeModal does not hit this path due to Shell conditional guard (alpine-erp `9610d57`).
Any future component returning null on first render will hit this.
**Fix:** `safeRender()` return type changed to `VNode | null`. All callers guarded:
`mount()` untrack block, `reactivity-setup.ts` render effect, and `update-manager.ts`
update dispatch all check `!== null` before passing to `commitVNode`.
Files: `packages/core/src/component/component.ts`, `reactivity-setup.ts`, `update-manager.ts`

---

### CG-03 — `fs.realpath()` leaks absolute paths into browser URLs (symlink resolution)
**Status:** FIXED `b9abf2c` (swite, 2026-03-08)
**Discovered:** 2026-03-08 (reflect-metadata and @alpine/* imports producing `/mnt/c/...` URLs)
**Symptom:** pnpm symlinks in `node_modules/` (e.g. `@swissjs/core → swiss-lib/packages/core`)
are resolved via `fs.realpath()` throughout the handler chain. Absolute filesystem paths
(e.g. `/mnt/c/.../swiss-lib/packages/core/src/index.ts`) were passed to `toUrl()`.
The `startsWith("/")` early-return in `toUrl()` fired before the correct `path.isAbsolute()`
handling block, and `normalizeResult()` mangled the path (`/swiss-lib/ → /swiss-packages/`)
producing invalid browser URLs like `/mnt/c/.../swiss-packages/...`.
**Root cause:** `toUrl()`'s `startsWith("/")` guard does not distinguish browser URL paths
(`/node_modules/...`) from Linux absolute filesystem paths (`/mnt/c/...`).
**Fix:** Build a symlink registry at server startup by scanning all `node_modules` dirs for
symlinks and mapping `realpath → /node_modules/<pkg-name>`. `toUrl()` checks the registry
first (with `fs.realpath()` fallback for unresolved symlink segments) before any other logic.
Files: `swite/src/resolver/symlink-registry.ts` (new), `url-resolver.ts`, `server.ts`.
**Workaround applied:** `import-map.json` pinned `reflect-metadata` to
`/node_modules/@swissjs/core/node_modules/reflect-metadata/Reflect.js`.

---

### CG-06 — async mount() overrides base class mount(container), preventing setupReactivity()
**Status:** FIXED `898a49d` (2026-03-14)
**Discovered:** 2026-03-14 (POS terminal stuck in loading state after await)
**Symptom:** Signal updates after `await` inside `async mount()` didn't trigger re-renders.
Component stayed permanently in loading state.
**Root cause:** The compiler's `mount` → `mounted` transform used `/\bmount\s*\{/g`, which
only matched the brace-only form (`mount { }`). When a user wrote `async mount() { }` with
explicit parentheses, the transform was skipped. The compiled class had `async mount()` as an
instance method, silently overriding the base class `mount(container: HTMLElement)`. The
framework calls `component.mount(container)` which hit the user's override instead — so
`initialize()` → `setupReactivity()` never ran, no render Effect was created, and Signal
changes after `await` never triggered re-renders.
**Fix (part 1 — compiler):** Added two new regex transforms in `swiss-syntax.ts` before the brace-only pattern:
- `async mount()` → `async mounted()`
- `mount()` → `private mounted()`
File: `packages/compiler/src/transformers/swiss-syntax.ts` (`898a49d`)

**Fix (part 2 — root cause):** `dom-creation.ts` calls `initialize()` directly without going
through `mount(container)`, so `_container` is never set for child components. When the render
effect fired post-await, `commitVNode()` exited early at `if (!container) return`, silently
dropping all reactive DOM updates. Fixed in `commitVNode()`: resolve existing DOM node from
`oldVNode.dom` or `_domNode` first; use `updateDOMNode` in-place when available, only require
`container` for the initial render with no existing DOM node.
File: `packages/core/src/component/component.ts` (`adc44dd`)

---

### CG-02 — `.ui` pipeline emits raw JSX; es-module-lexer cannot parse it
**Status:** FIXED `427aea1` (2026-03-07)
**Discovered:** 2026-03-07 (alpine-erp Table.ui 500 error)
**Symptom:** `UiCompiler.compileAsync()` routed `.ui` files through
`transformTypeScriptWithEsbuild()` which used `jsx: "preserve"`. Raw JSX
syntax remained in the compiled output. Swite's import-rewriter passes compiled
code to `es-module-lexer` which cannot parse JSX, producing:
`Parse error @:64:316` → `ERROR: Bare imports still present after rewriting`.
**Root cause:** `.ui` files contain JSX in `render()` methods but the compiler
treated them as pure TypeScript.
**Fix:** Route `.ui` files through `transformJsxWithEsbuild()` (same as `.uix`),
using `jsx: "transform"`, `jsxFactory: "createElement"`, `jsxFragment: "Fragment"`.
Output is valid ES module JS that `es-module-lexer` can parse.
**Workaround applied (alpine-erp):** Rewrote `Table.ui` to remove sub-render
methods and chained ternaries — still required since component patterns also
needed fixing independent of the pipeline bug.

---

### CG-08 — unmount { } collides with public async unmount() on base SwissComponent
**Status:** FIXED (2026-03-26)
**Discovered:** 2026-03-26 (audit after CG-06 fix; same class of bug as mount collision)
**Symptom:** `unmount { }` compiled to `private unmount()`, colliding with the public
`async unmount()` method on the base `SwissComponent` class. The user's teardown hook
was never called, and `unmountComponent()` dispatch looked for `.unmount` which is the
base class method, not the user hook.
**Fix (part 1 — compiler):** Added two new regex transforms in `swiss-syntax.ts` before
the brace-only pattern (mirrors CG-06 mount fix):
- `async unmount()` → `async unmounted()`
- `unmount()` → `private unmounted()`
- `unmount {` → `private unmounted() {`
Updated JSDoc at top of file.
File: `packages/compiler/src/transformers/swiss-syntax.ts`

**Fix (part 2 — runtime dispatch):** `unmountComponent()` now checks for `unmounted`
instead of `unmount` so the compiled hook is actually called during teardown.
File: `packages/core/src/component/component.ts`

---

## Manual Actions Pending
| ID   | Action                                              | Scope        | Status  |
|------|-----------------------------------------------------|--------------|---------|
| M-01 | Create @swissjs org on npmjs.com                   | npm          | PENDING |
| M-02 | Create @sws org on npmjs.com                       | npm          | PENDING |
| M-03 | Add NPM_TOKEN secret to kibologic org GitHub        | GitHub org   | PENDING |
| M-04 | Add CHANGESET_TOKEN secret to kibologic org GitHub  | GitHub org   | PENDING |
| M-05 | Run pnpm changeset → commit → push (v0.1.0)        | swiss-lib    | PENDING |
| M-06 | Set branch protection on main in swiss-lib          | GitHub repo  | PENDING |

---

## Session Log

### 2026-03-26
- Fixed SG-07: safeRender() return type changed to `VNode | null`, all commitVNode callers (mount(), reactivity-setup.ts render effect, update-manager.ts update dispatch) guarded against null
- Fixed CG-08: `unmount{}` → `unmounted()`, `unmountComponent()` dispatches `unmounted()`, compiler transforms updated with explicit-paren forms mirroring CG-06 mount fix
- tsc -b result: [see commit]
- Commit: [see git log]

---

## Notes
- Every session starts by reading this file. Every session ends by updating it.
- Pipeline rebuilt 2026-03-02. Next: M-01 through M-06 above, then first v0.1.0 publish.
