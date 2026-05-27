#!/bin/bash
# setup-branch-protection.sh — Automated branch protection setup
# Requires: GitHub personal access token with repo permissions

set -e

REPO="red1oon/bim-ootb"
BRANCH="main"

echo "=== Branch Protection Setup for $REPO ==="
echo ""

# Check if gh CLI is authenticated
if ! gh auth status &>/dev/null; then
  echo "GitHub CLI not authenticated. Please run:"
  echo "  gh auth login"
  echo ""
  echo "Then run this script again."
  exit 1
fi

echo "✓ GitHub CLI authenticated"
echo ""

# Create branch protection rule via GitHub API
echo "Setting up branch protection for '$BRANCH' branch..."
echo ""

# Configuration
PROTECTION_CONFIG=$(cat <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["fast-checks", "e2e-tests"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "required_linear_history": false,
  "required_signatures": false
}
EOF
)

echo "Protection settings:"
echo "  ✓ Require status checks to pass: fast-checks, e2e-tests"
echo "  ✓ Require branches to be up to date before merging"
echo "  ✓ Block force pushes"
echo "  ✓ Block branch deletions"
echo "  ✗ No pull request requirement (you can still push directly)"
echo "  ✗ No admin enforcement (you can bypass if needed)"
echo ""

# Apply protection
if gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/$REPO/branches/$BRANCH/protection" \
  --input - <<< "$PROTECTION_CONFIG" &>/dev/null; then

  echo "✅ Branch protection enabled successfully!"
  echo ""
  echo "What this means:"
  echo "  • Pushes to main are allowed ONLY if CI passes"
  echo "  • If CI fails, your push will be rejected"
  echo "  • You'll need to fix the issue and push again"
  echo ""
  echo "Test it:"
  echo "  1. Make a breaking change and commit"
  echo "  2. git push origin main"
  echo "  3. Should see: 'required status checks failed'"
  echo ""
  echo "View protection rules:"
  echo "  https://github.com/$REPO/settings/branch_protection_rules"

else
  echo "❌ Failed to set up branch protection."
  echo ""
  echo "Possible reasons:"
  echo "  1. Token lacks 'repo' permissions"
  echo "  2. You're not the repository owner/admin"
  echo "  3. GitHub API error"
  echo ""
  echo "Manual setup:"
  echo "  1. Go to: https://github.com/$REPO/settings/branches"
  echo "  2. Click 'Add rule'"
  echo "  3. Branch name pattern: main"
  echo "  4. Check: Require status checks to pass"
  echo "  5. Select: fast-checks, e2e-tests"
  echo "  6. Click 'Create'"
  echo ""
  echo "Or follow: BRANCH_PROTECTION_SETUP.md"
  exit 1
fi
