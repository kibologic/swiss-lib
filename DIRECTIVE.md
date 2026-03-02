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

## Notes
- Every session starts by reading this file. Every session ends by updating it.
