# SWISS Scripts Analysis & Cleanup Plan

## Analysis Date
December 18, 2024

## Scripts Inventory

### Root Directory Shell Scripts

#### 1. `fix-mount-bug.sh` ⚠️ **OUTDATED - CAN DELETE**
- **Purpose**: One-time fix for `performUpdate` guard
- **Status**: Changes already applied to codebase
- **Last Modified**: Dec 7, 2024
- **Action**: ✅ **DELETE** - Fix already applied, hardcoded Windows path, no longer needed
- **Verification**: The fix (`if (!this._container) return;`) is already in `component.ts`

#### 2. `integrate-ast-stripper.sh` ⚠️ **OUTDATED - CAN DELETE**
- **Purpose**: One-time integration of AST-based TypeScript syntax stripper
- **Status**: Changes already applied to codebase
- **Last Modified**: Dec 7, 2024
- **Action**: ✅ **DELETE** - Integration already complete, no longer needed
- **Verification**: AST transformer is already integrated in `compiler.ts`

### scripts/ Directory

#### Shell Scripts

##### 1. `scripts/prepare-staging.sh` ✅ **KEEP - ACTIVE**
- **Purpose**: Prepares develop branch for staging merge
- **Status**: Active, referenced in docs
- **Last Modified**: Nov 10, 2024
- **Action**: ✅ **KEEP** - Used for staging workflow
- **Usage**: Run before merging develop → staging

##### 2. `scripts/sync-staging.sh` ✅ **KEEP - ACTIVE**
- **Purpose**: Syncs develop → staging with file filtering
- **Status**: Active, includes fix scripts in DENY_LIST
- **Last Modified**: Dec 7, 2024
- **Action**: ✅ **KEEP** - Used for staging sync workflow
- **Note**: Already configured to exclude `fix-mount-bug.sh` and `integrate-ast-stripper.sh`

#### JavaScript Scripts

##### 1. `scripts/verify-docs.js` ⚠️ **OUTDATED - REPLACE**
- **Purpose**: Check JSDoc coverage for security package
- **Status**: Incomplete implementation, hardcoded to security package
- **Last Modified**: Dec 12, 2024
- **Action**: ⚠️ **REPLACE or UPDATE** - Incomplete, only checks security package
- **Recommendation**: Either complete implementation or remove if not used

##### 2. `scripts/update-docs.js` ⚠️ **OUTDATED - REPLACE**
- **Purpose**: Update API documentation using TypeDoc
- **Status**: Hardcoded to security package, uses old approach
- **Last Modified**: Dec 12, 2024
- **Action**: ⚠️ **REPLACE or UPDATE** - Superseded by `generate-api-docs.mjs`
- **Recommendation**: Remove if `generate-api-docs.mjs` handles this

#### ESM Module Scripts (.mjs) ✅ **ALL KEEP - ACTIVE**

All `.mjs` scripts in `scripts/` are active and used in `package.json`:

- ✅ `add-copyright-headers.mjs` - Used for copyright management
- ✅ `api-report-build.mjs` - Used in `api:build` script
- ✅ `api-report-check.mjs` - Used in `api:check` script
- ✅ `apply-barrel-suggestions.mjs` - Barrel file management
- ✅ `bootstrap-pnpm.mjs` - PNPM setup
- ✅ `bundle-size-report.mjs` - Bundle size reporting
- ✅ `check-barrels.mjs` - Used in `check:barrels` script
- ✅ `check-deep-imports.mjs` - Used in `check:policy` script
- ✅ `check-docs-api-determinism.mjs` - API documentation checks
- ✅ `check-public-barrels.mjs` - Used in `check:policy` script
- ✅ `check-src-artifacts.mjs` - Source artifact validation
- ✅ `check-tsconfig-outdir.mjs` - TypeScript config validation
- ✅ `check-ui-format.mjs` - Used in `check:ui-format` script
- ✅ `docs-redactor.mjs` - Documentation redaction
- ✅ `docs-visibility-filter.mjs` - Documentation visibility filtering
- ✅ `generate-api-docs.mjs` - API documentation generation
- ✅ `loc-report.mjs` - Used in `metrics:loc` script
- ✅ `mdlint-staged.mjs` - Used in lint-staged config
- ✅ `promotion-filter.mjs` - Used in `check:policy` script
- ✅ `update-package-licenses.mjs` - License management
- ✅ `verify-docs-sync.mjs` - Used in `precommit:docs-sync` hook
- ✅ `verify-licensing.mjs` - Used in `check:licensing` script

## Cleanup Actions

### Immediate Deletions

1. **Delete `fix-mount-bug.sh`**
   - Reason: One-time fix already applied
   - Hardcoded Windows path
   - Referenced in `sync-staging.sh` DENY_LIST (already excluded)

2. **Delete `integrate-ast-stripper.sh`**
   - Reason: One-time integration already complete
   - Referenced in `sync-staging.sh` DENY_LIST (already excluded)

### Review & Update

3. **Review `scripts/verify-docs.js`**
   - Option A: Complete implementation for all packages
   - Option B: Delete if not actively used
   - Currently only checks security package

4. **Review `scripts/update-docs.js`**
   - Option A: Update to use `generate-api-docs.mjs`
   - Option B: Delete if superseded
   - Currently hardcoded to security package

### Keep As-Is

5. **Keep all `.mjs` scripts** - All are active and used
6. **Keep staging scripts** - Active workflow tools

## Summary

- **Delete**: 2 files (fix-mount-bug.sh, integrate-ast-stripper.sh)
- **Review**: 2 files (verify-docs.js, update-docs.js)
- **Keep**: All other scripts (active and used)

## Next Steps

1. Delete outdated one-time fix scripts
2. Review and decide on verify-docs.js and update-docs.js
3. Update documentation if scripts are removed
4. Commit cleanup changes

