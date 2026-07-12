#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-development}"
CURRENT_BRANCH="$(git branch --show-current)"
REQUIRED_CHECK="${REQUIRED_CHECK:-Typecheck, lint, test, and build}"

if [ -z "$CURRENT_BRANCH" ]; then
  echo "No current branch found. Check out a feature branch first." >&2
  exit 1
fi

if [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ] || [ "$CURRENT_BRANCH" = "production" ]; then
  echo "Refusing to open an auto-merge PR from protected/shared branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run gh auth login or provide GH_TOKEN." >&2
  exit 1
fi

git push -u origin "$CURRENT_BRANCH"

PR_URL="$(gh pr view "$CURRENT_BRANCH" --json url --jq .url 2>/dev/null || true)"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create --fill --base "$BASE_BRANCH" --head "$CURRENT_BRANCH")"
fi

echo "PR: $PR_URL"

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
ALLOW_AUTO_MERGE="$(gh api "repos/$REPO" --jq .allow_auto_merge)"

if [ "$ALLOW_AUTO_MERGE" != "true" ]; then
  cat >&2 <<EOF
Repository auto-merge is not enabled for $REPO. Refusing to merge immediately,
because this workflow is only safe when GitHub can hold the PR until required
checks pass.
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

if ! gh pr merge "$CURRENT_BRANCH" --auto --squash --delete-branch; then
  cat >&2 <<'EOF'
Unable to enable auto-merge. Confirm the repository allows auto-merge and the
base branch has required status checks. Leave the PR open, fix any CI failures,
then rerun this command or merge manually after CI passes.
EOF
  exit 1
fi
