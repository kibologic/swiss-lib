# DIRECTIVE — swiss-lib
> Last updated: 2026-03-02 · Owner: Kibologic · Repo: kibologic/swiss-lib · License: MIT

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

### Pipeline (to be implemented — replaces old broken pipeline)
Delete ALL existing .github/workflows/ files first.
Then create:

File: .github/workflows/ci.yml
Trigger: push to main, all PRs
Jobs: pnpm install → pnpm build → pnpm test
      changeset presence check on PRs (warn only)

File: .github/workflows/release.yml
Trigger: push to main when .changeset/ has entries
Jobs: changeset version → bump package.json versions
      → update CHANGELOG.md → open version bump PR

File: .github/workflows/publish.yml
Trigger: push to main when version bump PR merged
Jobs: pnpm publish --access public for all MIT packages
      → create GitHub Release → tag vX.X.X

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
Old pipeline: BROKEN — hardcoded paths from old
monorepo, wrong workspace commands, missing secrets.
Action: delete all old workflow files before
creating new ones.

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

## Notes
- Every session starts by reading this file. Every session ends by updating it.
