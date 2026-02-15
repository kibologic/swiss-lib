<!--
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

# SwissJS Master Pipeline (, Authoritative)

This document defines the end-to-end <!-- MOVED TO INTERNAL: CI/CD --> strategy for SwissJS across branches, artifacts, and documentation classes. It is the source of truth for how code and documentation move from feature branches to public distribution.

---

## Objectives

- Keep developer velocity high while enforcing ruthless CI gates.
- Cleanly separate audiences and content:
  - Dev notes (ideas/progress logs) — never public.
  -  engineering docs (directives, codegen specs) — never public.
  - External/public docs (user-facing) — only these ship.
- Deterministic promotion: `feature → develop → staging → release → public main (mirror)`.
- Zero-leak guarantee: -only content never reaches release or public.

---

## Repository Layout (Authoritative)

- `packages/` — Codebase (core, compiler, cli, plugins, utils, components, devtools)
- `docs/`
  - `docs/devnotes/` — brainstorming/ideas/phase logs (never public)
  - `docs//` —  directives, codegen specs, ADRs, architecture (never public)
  - `docs/public/` — end‑user docs (the only doc tree intended to ship)
  - `docs/api/` — generated TypeDoc (public) via `tools/docs-runner`
  - `docs/development/` — team practices (private); don’t ship
- `tools/`
  - `tools/docs-runner/` — deterministic docs/API generation
  - `tools/redactor/` — sanitizes public docs, removes  markers
- `ci/`
  - `ci/policies/` — path allow/deny rules per stage
  - `ci/scripts/` — helper scripts for content checks, redaction, packaging

---

## Documentation Taxonomy & Transform Rules

- Dev notes — `docs/devnotes/`
  - Never ship. Allowed on `feature`/`develop`. Block on `staging`/`release`/`mirror`.
-  docs — `docs//`, `docs/development/`
  - Never ship. Block on `staging`/`release`/`mirror`.
- Public docs — `docs/public/`
  - Ship. Composed of:
    - Content in `docs/public/`
    - Generated API in `docs/api/`
    - Optionally, redacted  content via `tools/redactor/` using markers:
      - `<!-- -start --> ... <!-- -end -->`
      - Single-line markers: `<!-- @todo- -->`
  - Sanitized output lands in `staging/public-docs-build/` before packaging.
- API docs — `docs/api/`
  - Built by `tools/docs-runner` (pinned TS/TypeDoc). Deterministic; drift fails CI.

---

## <!-- MOVED TO INTERNAL: CI/CD --> Stages & Gates

### 1) Feature Branches

- Goal: fast feedback; iterate freely.
- Allow: dev notes &  docs.
- Gates:
  - Lint, type-check, unit tests (e.g., a11y tests for `packages/components`)
  - Quick build
  - Optional API build (label-driven)
- Workflows:
  - `ci.yml` (matrix lint/test/type-check)
  - `docs.yml` (optional API build when labeled)

### 2) `develop`

- Goal: integration & consistency.
- Allow: devnotes/ (still OK here).
- Gates:
  - Full lint + type-check + unit/integration tests
  - Policy checks: barrels, curated exports, API baselines
  - Deterministic docs API build (read-only check unless it’s the Changesets PR)
  - Leak-prevention (warn): flag if public docs reference `` markers
- Workflows:
  - `changesets-version.yml`
  - `ci.yml` (full)
  - `policy-checks.yml` (barrels/API)
  - `docs.yml` (build API; no publish)

### 3) `staging`

- Goal: production validation.
- Block: devnotes/ (no longer allowed in artifacts).
- Gates:
  - Same as `develop`, plus strict No‑‑Content gate:
    - Fail if any path from `docs//`, `docs/devnotes/`, `docs/development/` appears in the release bundle or docs site
  - Run redactor to produce `staging/public-docs-build/` (sanitized public docs)
  - Optional: vulnerability & license checks
- Workflows:
  - `ci.yml` (full)
  - `docs.yml` (build + sanitize public docs)
  - `policy-checks.yml` (strict)
  - `audit.yml` (optional)

### 4) `release`

- Goal: produce immutable artifacts; ship.
- Block: all  content. Redaction enforced.
- Gates:
  - Everything above
  - Generate artifacts: dist tarballs, npm publish candidates, docs site bundle from `staging/public-docs-build + docs/api`
  - Verify zero  residue in release artifacts
- Workflows:
  - `changesets-publish.yml` (on tags `v*.*.*`)
  - `ci.yml` (verify)
  - `docs.yml` (build site bundle, optional publish)
  - `mirror-to-public.yml` (clean export mirror)

### 5) Public Mirror (`main`)

- Source: `release` only.
- Behavior: clean export that excludes private paths.
- Enforced excludes (as of now):
  - `.git/`, `.github/workflows/`, `.github/ISSUE_TEMPLATE/`, `tools/`, `scripts/`, `etc/`, `docs//`, `docs/devnotes/`, `docs/development/`
- Auth: GitHub App token (PKCS#8 key) via `actions/create-github-app-token@v1`
- Implementation: `.github/workflows/mirror-to-public.yml` (clean export; daily schedule; manual trigger)

---

## Policy Matrix (What’s Allowed Where)

| Stage   | Devnotes/ | Redaction | Public Docs Ship | Mirror |
| ------- | ----------------- | --------- | ---------------- | ------ |
| feature | allowed           | not req.  | optional         | n/a    |
| develop | allowed           | warn only | yes (build)      | n/a    |
| staging | blocked           | required  | yes (sanitized)  | n/a    |
| release | blocked           | required  | yes (sanitized)  | mirror |
| mirror  | excluded          | n/a       | yes (sanitized)  | yes    |

---

## Enforcement Techniques

- Path policies & deny-lists enforced in CI scripts
  - Fail `staging`/`release` if  paths appear in artifacts or docs site
- Redactor (`tools/redactor/`)
  - Strips `` blocks/markers; fails if any residue remains
- Protected branches
  - `develop`, `staging`, `release` protected; required checks: `ci`, `policy-checks`, `docs`
- PR templates & labels
  - Require `pnpm reset` before PR
  - Labels: `docs:` (disallowed on staging/release), `docs:public` (triggers docs build)

---

## Artifacts & Publishing

- NPM publish via Changesets
  - `develop → staging → release`, tag `vX.Y.Z` → `changesets-publish.yml` pushes to npm
- Docs site
  - Built from `staging/public-docs-build + docs/api`
  - Optionally deployed via GH Pages or a public docs repo

---

## Observability & Hygiene

- Status badges: CI, Policy Checks, Mirror
- Scheduled mirror keeps public current daily
- Optional notifications (Slack/Discord) on failures

---

## Security & Secrets

- Mirror uses GitHub App token (PKCS#8 key only)
- Secrets:
  - `APP_ID`, `APP_PRIVATE_KEY`
  - `PUBLIC_REPO` or (`PUBLIC_OWNER` + `PUBLIC_REPO_NAME`)
  - Optional: docs publishing credentials if deploying docs site

---

## Immediate Engineering Tasks (Backlog)

1. `policy-checks.yml` — strict no‑ gate for `staging`/`release`.
2. `tools/redactor/` scaffolding and CLI to sanitize `docs/public/`.
3. `docs.yml` — build API + sanitize public docs; optional publish on `release`.
4. Update PR template with docs & redaction checkboxes.
5. Labels automation for `docs:`/`docs:public`.

This plan is authoritative. Deviation requires an ADR in `docs//` and approval.
