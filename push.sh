#!/bin/bash
# ============================================================================
# push.sh — Gated push to personal GitHub via feature branch + PR (OneClick Apply)
# ============================================================================
# Usage:
#   ./push.sh "feat(engine): add Ashby adapter"        # gates → branch → push → PR
#   ./push.sh "fix: …" --merge                         # also enable squash auto-merge
#
# Flow:
#   0. Pre-push gates (fail fast): type-check → lint → format → tests → build
#   1. Repo-local git identity = personal account; create GitHub repo if missing
#   2. Sync local main with remote
#   3. Feature branch from the commit message, commit, push
#   4. Open a PR via gh  (auto-merge ONLY with --merge — you review first by default)
#
# main is branch-protected: never pushes to main directly.
# ============================================================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
PERSONAL_NAME="Rohit Mengji"
PERSONAL_EMAIL="rohitmengjih@gmail.com"
GITHUB_USER="Rohitmengji"
REPO_NAME="applify-jobs"
REMOTE_NAME="personal"
BRANCH="main"
# ──────────────────────────────────────────────────────────────────────────────

# Parse args: first non-flag arg is the commit message; --merge enables auto-merge.
COMMIT_MSG=""
AUTO_MERGE=false
for arg in "$@"; do
  case "$arg" in
    --merge) AUTO_MERGE=true ;;
    *) [ -z "$COMMIT_MSG" ] && COMMIT_MSG="$arg" ;;
  esac
done
COMMIT_MSG="${COMMIT_MSG:-chore: update OneClick Apply}"

# Package-manager shim: prefer pnpm on PATH, else corepack.
if command -v pnpm >/dev/null 2>&1; then PM="pnpm"; else PM="corepack pnpm"; fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 PRE-PUSH GATES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "" && echo "1️⃣  Type check (wxt prepare + tsc)…"
$PM compile
echo "   ✅ types clean"

echo "" && echo "2️⃣  Lint…"
$PM lint
echo "   ✅ lint clean"

echo "" && echo "3️⃣  Format check…"
$PM format:check
echo "   ✅ formatting clean"

echo "" && echo "4️⃣  Tests…"
$PM test
echo "   ✅ tests pass"

echo "" && echo "5️⃣  Production build…"
$PM build
echo "   ✅ build ok"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL GATES PASSED — proceeding to push"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Git identity + remote ────────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  echo "⚠️  GitHub CLI (gh) not found. Install: brew install gh && gh auth login"
  exit 1
fi

git config user.name "$PERSONAL_NAME"
git config user.email "$PERSONAL_EMAIL"
git config pull.rebase true
echo "📧 Local git identity: $(git config user.name) <$(git config user.email)>"

# Create the GitHub repo on first push if it doesn't exist yet.
if ! gh repo view "$GITHUB_USER/$REPO_NAME" >/dev/null 2>&1; then
  echo "📦 Repo $GITHUB_USER/$REPO_NAME not found — creating it (private)…"
  gh repo create "$GITHUB_USER/$REPO_NAME" --private --source=. --remote="$REMOTE_NAME" --push=false
fi

REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi
echo "🔗 Remote '$REMOTE_NAME' → $REMOTE_URL"

# ─── Sync, branch, commit, push ───────────────────────────────────────────────
echo "🔄 Fetching remote…"
git fetch "$REMOTE_NAME" "$BRANCH" 2>/dev/null || true
git branch --unset-upstream "$BRANCH" 2>/dev/null || true

BRANCH_NAME=$(echo "$COMMIT_MSG" | sed 's/[^a-zA-Z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' \
  | tr '[:upper:]' '[:lower:]' | cut -c1-50)
BRANCH_NAME="${BRANCH_NAME:-update}"

echo "📝 Staging changes…"
git add -A

if git diff --cached --quiet; then
  echo "ℹ️  No changes to commit."
  exit 0
fi

echo "💾 Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG

Gates: tsc · eslint · prettier · vitest · wxt build.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"

echo "Pushing to $REMOTE_NAME/$BRANCH_NAME ..."
git push -u "$REMOTE_NAME" "HEAD:$BRANCH_NAME"

# --- Open PR (merge only on explicit --merge) ----------------------------------
echo "Opening Pull Request..."
PR_URL=$(gh pr create \
  --repo "$GITHUB_USER/$REPO_NAME" \
  --head "$BRANCH_NAME" \
  --base "$BRANCH" \
  --title "$COMMIT_MSG" \
  --body "$COMMIT_MSG

🤖 Generated with [Claude Code](https://claude.com/claude-code)" 2>&1) || true

echo "$PR_URL"

if [ "$AUTO_MERGE" = true ]; then
  echo "🔀 Enabling squash auto-merge (will merge once checks are green)…"
  gh pr merge "$BRANCH_NAME" --repo "$GITHUB_USER/$REPO_NAME" --squash --auto --delete-branch \
    || echo "   ℹ️  Auto-merge queued (waiting for CI)."
else
  echo ""
  echo "👀 PR opened for review. Merge when ready with:"
  echo "   gh pr merge $BRANCH_NAME --repo $GITHUB_USER/$REPO_NAME --squash --delete-branch"
fi

echo ""
echo "✅ Done — https://github.com/$GITHUB_USER/$REPO_NAME"
