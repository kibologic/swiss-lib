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

## Phase 1: Documentation Segregation & Redaction (DOCS) ✅

- [x] Create env-specific TypeDoc configs (resolved 2026-06-30 — feature/docs-segregation)
  - [x] `docs/config/typedoc.develop.json` — excludeInternal:false, all visibility flags on
  - [x] `docs/config/typedoc.staging.json` — excludeInternal:true, private/protected hidden, alpha/beta visible
  - [x] `docs/config/typedoc.release.json` — excludeInternal:true, all non-public hidden including alpha/beta
- [x] Redaction script (resolved 2026-06-30 — feature/docs-segregation)
  - [x] `scripts/docs-redactor.mjs` strips `@internal`, dev-notes, and internal sections
  - [ ] Redactor test/fixture outputs (deferred — verify step in CI covers integration check)
- [x] CI for docs with env-matrix (resolved 2026-06-30 — feature/docs-segregation)
  - [x] `.github/workflows/docs.yml` (develop/staging/release matrix build)
  - [x] Build docs → run redactor (except develop) → verify no internal tokens remain

## Phase 2: Security Workflows (SAST, Deps, Secrets, Semgrep) ✅

- [x] ESLint SAST (resolved 2026-06-30 — feature/sast-ci-workflow)
  - [x] `eslint-plugin-security` / `eslint-plugin-sonarjs` configured in `.eslintrc.sast.cjs`
  - [x] Root script `lint:sast` in `package.json`; workflow `.github/workflows/sast-eslint.yml` created
- [x] Dependency audit (resolved 2026-06-30 — feature/security-ci-workflows)
  - [x] `.github/workflows/deps-audit.yml` — weekly + on-push; fails on high/critical CVEs
- [x] Secrets scanning (resolved 2026-06-30 — feature/security-ci-workflows)
  - [x] `.github/workflows/gitleaks.yml` + `.gitleaks.toml` baseline
- [x] Semgrep scanning (resolved 2026-06-30 — feature/security-ci-workflows)
  - [x] `.github/workflows/semgrep.yml` + `.semgrep.yml` rules for eval, innerHTML, document.write

## Phase 3: Policy & File Structure Enforcement ✅

- [x] Policy scripts in `scripts/` (pre-existed or added)
  - [x] `check-barrels.mjs`: verify barrels exist, reject deep imports
  - [x] `check-deep-imports.mjs`: denylists for `internal`, `__tests__`, etc.
  - [x] `check-ui-format.mjs`: enforce UI file formatting
  - [x] `promotion-filter.mjs`: ensure no sensitive files in staging/release artifacts
- [x] CI workflow (resolved 2026-06-30 — feature/policy-ci-workflow)
  - [x] `.github/workflows/policy.yml` runs barrel, policy, and UI format checks on PRs

## Phase 4: Branch Protections & Gates

- [x] Document required checks in `CONTRIBUTING.md` (resolved 2026-06-30 — feature/docs-segregation)
- [ ] Apply GitHub branch protections for `develop` (requires GitHub admin — manual step):
  - Required status checks: Build+Test, Type-check, Lint, CodeQL, SAST, Deps Audit, Gitleaks, Semgrep, Policy, Docs
  - Require PR reviews; disallow force-push

## Phase 5: Barrel Enforcement & Linting ✅

- [x] ESLint rule to disallow deep imports across packages (resolved 2026-06-30 — root eslint.config.mjs)
  - `no-restricted-imports` pattern: `@kibologic/*/src/**` is forbidden; use barrel instead
- [ ] Make `check-barrels.mjs` report actionable suggestions (non-destructive) — deferred

## Phase 6: Husky Hook Hardening ✅

- [x] `pre-commit`: runs barrel check, UI format check, lint (feature/husky-hooks — `.husky/pre-commit`)
- [x] `commit-msg`: enforces conventional commits format `type(scope): description` (`.husky/commit-msg`)
- [x] `pre-push`: runs lint, type-check, barrel check, policy check (`.husky/pre-push`)
- [x] `.husky/` removed from `.gitignore` so hooks are tracked in version control
- [x] Verified no `--no-verify` bypasses in CI workflows

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
