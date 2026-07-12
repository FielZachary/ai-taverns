#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-production}"
CURRENT_BRANCH="$(git branch --show-current)"
REQUIRED_CHECK="${REQUIRED_CHECK:-Typecheck, lint, test, and build}"
PR_TITLE="${PR_TITLE:-Promote development to production}"
PR_BODY="${PR_BODY:-Promotes the current development branch to production after required CI passes.}"

if [ -z "$CURRENT_BRANCH" ]; then
  echo "No current branch found. Check out a production promotion branch first." >&2
  exit 1
fi

if [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ] || [ "$CURRENT_BRANCH" = "development" ]; then
  echo "Refusing to promote from protected/shared branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if printf '%s\n%s\n' "$PR_TITLE" "$PR_BODY" | grep -Eiq '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|skip-checks:[[:space:]]*true'; then
  echo "Refusing to use a production PR title/body with a GitHub Actions skip directive." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run gh auth login or provide GH_TOKEN." >&2
  exit 1
fi

git push -u origin "$CURRENT_BRANCH"

PR_URL="$(gh pr view "$CURRENT_BRANCH" --json url --jq .url 2>/dev/null || true)"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "$CURRENT_BRANCH" \
    --title "$PR_TITLE" \
    --body "$PR_BODY")"
fi

echo "PR: $PR_URL"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
ALLOW_AUTO_MERGE="$(gh api "repos/$REPO" --jq .allow_auto_merge)"

if [ "$ALLOW_AUTO_MERGE" != "true" ]; then
  cat >&2 <<EOF
Repository auto-merge is not enabled for $REPO. Refusing to merge immediately,
because production promotion should wait for required checks.
EOF
  exit 1
fi

if ! REQUIRED_CHECKS="$(gh api "repos/$REPO/branches/$BASE_BRANCH/protection/required_status_checks" --jq '.contexts[]?' 2>/dev/null)"; then
  cat >&2 <<EOF
Could not read required status checks for $BASE_BRANCH. Refusing to merge,
because branch protection is what turns this PR into a CI gate.
EOF
  exit 1
fi

if ! printf '%s\n' "$REQUIRED_CHECKS" | grep -Fxq "$REQUIRED_CHECK"; then
  cat >&2 <<EOF
Required check "$REQUIRED_CHECK" is not configured on $BASE_BRANCH.
Configured checks:
$REQUIRED_CHECKS

Refusing to merge until the CI gate is actually required.
EOF
  exit 1
fi

if ! gh pr merge "$CURRENT_BRANCH" \
  --auto \
  --squash \
  --delete-branch \
  --subject "$PR_TITLE" \
  --body "$PR_BODY"; then
  cat >&2 <<'EOF'
Unable to enable auto-merge. Confirm the repository allows auto-merge and the
base branch has required status checks. Leave the PR open, fix any CI failures,
then rerun this command or merge manually with a clean squash title/body.
EOF
  exit 1
fi
