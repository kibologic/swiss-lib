#!/bin/bash
set -e

echo "🔄 Preparing develop branch for staging merge..."

# Ensure we're on develop
if [ "$(git branch --show-current)" != "develop" ]; then
    echo "❌ Must be on develop branch"
    exit 1
fi

echo "✅ On develop branch"

# Check for unwanted files/directories
echo "🔍 Checking for unwanted files that should not reach staging..."

# Development-only files that will be blocked from staging
BLOCKED_ITEMS=(
    ".changeset"              # Version management (internal)
    ".cursor"                 # AI assistant config (personal)
    ".github"                 # CI workflows and GitHub config (internal)
    ".husky"                  # Git hooks (development)
    "docs_old"                # Outdated docs (cleanup)
    "jira"                    # Project management (internal)
    ".turbo"                  # Build cache (generated)
    "node_modules"            # Dependencies (generated)
    ".eslintignore"           # Linting config (development)
    ".gitleaks.toml"          # Secret scanning (CI only)
    ".nvmrc"                  # Node version (development)
    "pnpm-lock.yaml"          # Lock file (development)
    "CODEOWNERS"              # GitHub ownership (internal)
    ".eslintrc.sast.cjs"      # Security linting (CI)
    ".markdownlint-cli2.yaml" # Markdown linting (development)
    ".pre-commit-config.yaml" # Pre-commit hooks (development)
    ".prettierignore"         # Code formatting (development)
    ".semgrep.yml"            # Security analysis (CI)
    "vitest.config.ts"        # Test config (development)
    "eslint.config.mjs"       # Linting config (development)
    "tsconfig.base.json"      # TypeScript config (development)
    "turbo.json"              # Monorepo config (development)
    "typedoc.base.json"       # Doc generation (development)
    "typedoc.json"            # Doc generation (development)
)

FOUND_BLOCKED=false

for item in "${BLOCKED_ITEMS[@]}"; do
    if [ -e "$item" ]; then
        echo "⚠️  Found development file: $item"
        echo "   This will be blocked from staging by CI"
        FOUND_BLOCKED=true
    fi
done

# Check for VSCode extension
if [ ! -d "packages/devtools/vscode_extension/src" ]; then
    echo "❌ CRITICAL: VSCode extension source missing!"
    echo "   Check .gitignore - extension code must be included"
    exit 1
fi

echo "✅ VSCode extension source present"

# Summary
if [ "$FOUND_BLOCKED" = true ]; then
    echo ""
    echo "⚠️  WARNING: Development files found"
    echo "   These will be automatically blocked by staging CI"
    echo "   Staging branch will remain clean and production-ready"
else
    echo "✅ No development-only files found"
fi

echo ""
echo "🎯 Develop branch ready for staging merge"
echo "   - VSCode extension: ✅ Included"
echo "   - Unwanted dirs: 🚫 Will be blocked by CI"
echo ""
echo "Next steps:"
echo "1. Push develop: git push origin develop"
echo "2. Create PR: develop → staging"
echo "3. CI will automatically filter unwanted files"
