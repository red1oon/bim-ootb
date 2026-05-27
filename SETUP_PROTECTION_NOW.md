# Quick Setup - Branch Protection (2 minutes)

## Option 1: Automated Script (Recommended)

```bash
# Step 1: Re-authenticate GitHub CLI
gh auth login
# Choose: GitHub.com → HTTPS → Yes (git credentials) → Login with browser

# Step 2: Run setup script
./setup-branch-protection.sh

# Done! ✅
```

---

## Option 2: Manual Web UI (If script fails)

1. **Open this URL:** https://github.com/red1oon/bim-ootb/settings/branches

2. **Click:** "Add branch protection rule"

3. **Branch name pattern:** `main`

4. **Check these boxes:**
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - In the search box, select:
     - ✅ `fast-checks`
     - ✅ `e2e-tests`

5. **Leave unchecked:**
   - ☐ Require a pull request before merging (unless you want PR workflow)
   - ☐ Require approvals
   - ☐ Require signed commits

6. **At bottom, check:**
   - ✅ Do not allow bypassing the above settings

7. **Click:** "Create"

---

## What You'll Get

**Before:**
```bash
git push
# → Always succeeds, even if CI fails
# → Broken code goes to production
```

**After:**
```bash
git push
# → GitHub checks CI status
# → If CI passing: ✅ Push succeeds
# → If CI failing: ❌ Push rejected
# → You must fix and push again
```

---

## Test It Works

After setup, test:

```bash
# Make a breaking change
echo "// BREAK" >> viewer/streaming.js
git add viewer/streaming.js
git commit -m "test: break CI intentionally"

# Try to push
git push origin main

# Should see:
# remote: error: GH006: Protected branch update failed
# remote: Required status check "e2e-tests" is expected.
# ❌ Push rejected!

# Fix it
git revert HEAD
git push origin main
# ✅ This time it works (CI will pass)
```

---

## Recommended Settings Summary

| Setting | Enable? | Why |
|---------|---------|-----|
| Require status checks | ✅ Yes | Blocks broken code |
| Required checks: fast-checks | ✅ Yes | Syntax + whitebox tests |
| Required checks: e2e-tests | ✅ Yes | Playwright E2E + contract |
| Require pull requests | ☐ Your choice | Adds review step, slower iteration |
| Do not allow bypass | ✅ Yes | Even admins must pass CI |
| Allow force push | ☐ No | Dangerous |
| Allow deletions | ☐ No | Protects main branch |

---

**Start here:** https://github.com/red1oon/bim-ootb/settings/branches

Or run: `./setup-branch-protection.sh` (after `gh auth login`)
