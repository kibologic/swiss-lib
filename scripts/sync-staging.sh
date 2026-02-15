#!/bin/bash
set -euo pipefail

# Branch configuration
SOURCE_BRANCH="develop"
TARGET_BRANCH="staging"

# Paths that must NEVER end up on staging
DENY_LIST=(
  "jira"
  ".cursor"
  ".husky-disabled"
  "docs_old"
  ".changeset"
  "docs/internal"
  "docs/tasks"
  "docs/reports"
  "docs/metrics"
  "docs/PHASE6_PLAN.md"
  "docs/TECH_DEBT.md"
  "CRITICAL_BUG_FIX.md"
  ".semgrep.yml"
  "fix-mount-bug.sh"
  "integrate-ast-stripper.sh"
  "add-fragment.py"
)

# Safety keywords in filenames – warn if found
SAFETY_KEYWORDS=(
  "secret"
  "credential"
  "private_key"
  "internal_only"
)

DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      echo "🔍 DRY RUN MODE: no changes will be committed"
      ;;
  esac
done

echo "🔄 Syncing local $SOURCE_BRANCH → $TARGET_BRANCH with filter (no fetch, no merge)"

# Must be at repo root
if [ ! -f "package.json" ]; then
  echo "❌ Must run from repo root (where package.json lives)"
  exit 1
fi

# Ensure SOURCE_BRANCH exists locally
if ! git show-ref --verify --quiet "refs/heads/$SOURCE_BRANCH"; then
  echo "❌ Local branch '$SOURCE_BRANCH' does not exist"
  exit 1
fi

# Ensure TARGET_BRANCH exists locally
if ! git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
  echo "❌ Local branch '$TARGET_BRANCH' does not exist"
  exit 1
fi

# Ensure source branch is clean
git checkout "$SOURCE_BRANCH" >/dev/null 2>&1
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree on $SOURCE_BRANCH is not clean. Commit or stash first."
  exit 1
fi

# Prepare target
if [ "$DRY_RUN" = true ]; then
  TEMP_BRANCH="temp-sync-dry-run-$(date +%s)"
  echo "🧪 Creating temp branch '$TEMP_BRANCH' from local $TARGET_BRANCH"
  git checkout "$TARGET_BRANCH" >/dev/null 2>&1
  git checkout -b "$TEMP_BRANCH" >/dev/null 2>&1
  WORK_BRANCH="$TEMP_BRANCH"
else
  echo "📦 Using real target branch '$TARGET_BRANCH'"
  git checkout "$TARGET_BRANCH" >/dev/null 2>&1
  WORK_BRANCH="$TARGET_BRANCH"
fi

echo "🔁 Resetting $WORK_BRANCH to local $SOURCE_BRANCH (no merge)"
git reset --hard "$SOURCE_BRANCH"

echo "🧹 Removing deny-listed files/dirs from $WORK_BRANCH"
for item in "${DENY_LIST[@]}"; do
  if [ -e "$item" ]; then
    echo "   - Removing: $item"
    rm -rf "$item"
    git rm -r --cached "$item" 2>/dev/null || true
  fi
done

echo "🛡️  Safety scan (filenames containing sensitive keywords)"
for keyword in "${SAFETY_KEYWORDS[@]}"; do
  found_files=$(find . -type f -name "*$keyword*" -not -path "./.git/*" || true)
  if [ -n "$found_files" ]; then
    echo "⚠️  Files containing '$keyword' in name:"
    echo "$found_files"
  fi
done

echo "📝 Updating .gitignore automated sync block"
GITIGNORE_MARKER="# --- AUTOMATED SYNC BLOCK ---"

if [ -f ".gitignore" ]; then
  sed -i "/$GITIGNORE_MARKER/Q" .gitignore 2>/dev/null || true
fi

{
  echo ""
  echo "$GITIGNORE_MARKER"
  echo "# Files automatically removed during sync from $SOURCE_BRANCH to $TARGET_BRANCH"
  for item in "${DENY_LIST[@]}"; do
    echo "$item"
  done
} >> .gitignore

git add .

if [ "$DRY_RUN" = true ]; then
  echo "✅ Dry run complete on $WORK_BRANCH. Staged diff (not committed):"
  git status
  echo "   When done inspecting, you can delete: git branch -D $WORK_BRANCH"
else
  echo "💾 Committing sync on $WORK_BRANCH"
  git commit -m "chore: sync from $SOURCE_BRANCH to $TARGET_BRANCH with filtered files"
  echo "✅ Sync complete on $TARGET_BRANCH"
  echo "   Push when ready: git push origin $TARGET_BRANCH"
fi
