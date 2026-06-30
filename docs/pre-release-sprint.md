<!--
Copyright (c) 2024 Themba Mzumara
This file is part of SwissJS Framework. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.
-->

# Pre-Release Sprint Plan: Security, Quality, Pipeline Hardening

Branch: `feature/security-hardening-pipeline`
Owner: Release Engineering
Status: Planning → In Progress

This sprint strengthens code safety, cleanliness, robustness, and pipeline security across the SwissJS monorepo.

## Success Criteria

- Documentation segregated by environment (develop/staging/release) with redaction for sensitive/internal content.
- CI security checks green: ESLint SAST, dependency audit, secrets scan (gitleaks), Semgrep, CodeQL, and policy checks.
- File structure validations and promotion filters prevent inclusion of sensitive files.
- Branch protections enforce mandatory gates; bypasses blocked.
- Barrel patterns enforced uniformly; lint/policy checks pass repo-wide.

---

## Phase 1: Documentation Segregation & Redaction (DOCS)

- [ ] Create env-specific TypeDoc configs
  - [ ] `docs/config/typedoc.develop.json`
  - [ ] `docs/config/typedoc.staging.json`
  - [ ] `docs/config/typedoc.release.json`
- [ ] Redaction script
  - [ ] `scripts/docs-redactor.mjs` strips `@internal`, dev-notes, and internal sections
  - [ ] Redactor test/fixture outputs
- [ ] CI for docs with env-matrix
  - [ ] `.github/workflows/docs.yml` (develop/staging/release)
  - [ ] Build docs → run redactor (except develop) → verify no internal tokens remain

## Phase 2: Security Workflows (SAST, Deps, Secrets, Semgrep)

- [x] ESLint SAST (resolved 2026-06-30 — `.eslintrc.sast.cjs` + `lint:sast` script pre-existed; `sast-eslint.yml` created on feature/sast-ci-workflow)
- [x] Dependency audit (resolved 2026-06-30)
  - [x] `.github/workflows/deps-audit.yml` — weekly + on-push; fails on high/critical CVEs
- [x] Secrets scanning (resolved 2026-06-30)
  - [x] `.github/workflows/gitleaks.yml` + `.gitleaks.toml` baseline
- [x] Semgrep scanning (resolved 2026-06-30)
  - [x] `.github/workflows/semgrep.yml` + `.semgrep.yml` — eval, innerHTML, document.write

## Phase 3: Policy & File Structure Enforcement

- [ ] Enhance policy scripts in `scripts/`
  - [ ] `check-barrels.mjs`: verify barrels exist, reject deep imports
  - [ ] `check-public-barrels.mjs`: enforce public-only exports
  - [ ] `check-deep-imports.mjs`: denylists for `internal`, `__tests__`, etc.
  - [ ] `promotion-filter.mjs`: ensure no sensitive files are in staging/release artifacts
- [ ] CI workflow
  - [ ] `.github/workflows/policy.yml` runs all policy scripts on PRs to `develop`

## Phase 4: Branch Protections & Gates

- [ ] Document required checks in `CONTRIBUTING.md`
- [ ] Apply GitHub branch protections for `develop` (maintainers):
  - Required status checks: Build+Test, Type-check, Lint, CodeQL, SAST, Deps Audit, Gitleaks, Semgrep, Policy, Docs
  - Require PR reviews; disallow force-push

## Phase 5: Barrel Enforcement & Linting

- [ ] ESLint rule(s) to disallow deep imports across packages
- [ ] Make `check-barrels.mjs` report actionable suggestions (non-destructive)

## Phase 6: Husky Hook Hardening

- [ ] Keep commit-message format enforcement (ticket IDs)
- [ ] Maintain pre-push checks (type-check, lint, tests, policy)
- [ ] Verify no `--no-verify` bypasses in our workflows

---

## Milestones

- M1: Docs segregation + redaction pipeline green
- M2: Core security workflows green (SAST, deps, secrets, Semgrep)
- M3: Policy/file structure checks enforced
- M4: Branch protections configured and documented
- M5: Barrel enforcement finalization
- M6: Husky verification

## References

- Root scripts: `scripts/check-deep-imports.mjs`, `scripts/check-public-barrels.mjs`, `scripts/check-ui-format.mjs`, `scripts/check-barrels.mjs`
- Packages: `packages/*`, `packages/plugins/*`, `packages/devtools/*`
- Node: 20.x across workspace
