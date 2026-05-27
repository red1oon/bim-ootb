# Branch Protection Setup Guide

This guide sets up branch protection rules to **prevent broken code from reaching production**.

## What You'll Get

**Before (Current):**
```
Push to main → ❌ CI fails → Code still deploys to GitHub Pages (broken site live)
```

**After (Protected):**
```
Push to feature branch → ❌ CI fails → Pull Request blocked → Can't merge
Push to feature branch → ✅ CI passes → Can merge to main → Deploys
```

---

## Step-by-Step Setup (5 minutes)

### 1. Go to Repository Settings

Open: https://github.com/red1oon/bim-ootb/settings/branches

Or navigate:
1. Go to https://github.com/red1oon/bim-ootb
2. Click **Settings** tab (top right)
3. Click **Branches** in left sidebar

### 2. Add Branch Protection Rule

Click **Add rule** button

### 3. Configure Protection Settings

**Branch name pattern:**
```
main
```

**Enable these checkboxes:**

- ✅ **Require a pull request before merging**
  - ☐ Require approvals (uncheck if you work solo)
  - ☐ Dismiss stale reviews (optional)
  - ✅ **Require review from Code Owners** (optional, if you have CODEOWNERS file)

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - **Select these status checks:**
    - ✅ `fast-checks`
    - ✅ `e2e-tests`

- ✅ **Require conversation resolution before merging** (optional)

- ✅ **Do not allow bypassing the above settings**
  - ☐ Allow force pushes (keep UNCHECKED - dangerous!)
  - ☐ Allow deletions (keep UNCHECKED)

**Leave unchecked:**
- ☐ Require signed commits (unless you use GPG)
- ☐ Require linear history (can be annoying)
- ☐ Lock branch (only for special cases)

### 4. Save

Click **Create** button at the bottom

### 5. Verify Protection is Active

You should see:
```
Branch protection rule: main
✓ Require status checks: fast-checks, e2e-tests
✓ Require pull request before merging
```

---

## New Workflow After Setup

### Solo Development (Recommended)

```bash
# 1. Create feature branch
git checkout -b fix/streaming-contract
# Make changes...
git add .
git commit -m "fix: streaming contract validation"
git push -u origin fix/streaming-contract

# 2. Create Pull Request
gh pr create --title "Fix streaming contract" --body "Fixes metadata routing"
# Or use GitHub web UI: https://github.com/red1oon/bim-ootb/compare

# 3. Wait for CI (~95s)
# ✅ CI passes → "Merge pull request" button appears
# ❌ CI fails → "Merge" button is BLOCKED (grayed out)

# 4. If CI passes, merge via web UI
# Or: gh pr merge --squash

# 5. Pull merged changes
git checkout main
git pull
```

### Emergency Hotfix (Admin Override)

If you need to push directly to main (emergencies only):

**Option A: Temporarily disable protection**
1. Go to Settings → Branches
2. Edit `main` rule
3. Uncheck "Do not allow bypassing"
4. Push your fix
5. Re-enable protection

**Option B: Admin bypass (if you're repo owner)**
GitHub Settings → General → scroll to "Pull Requests"
- Enable: "Allow merge commits" (so you can merge even if checks fail)

---

## Alternative: Lightweight Protection (No PRs Required)

If you want CI to **warn** but not **block** direct pushes:

**Settings:**
- ✅ Require status checks to pass before merging
- ☐ Require a pull request before merging (UNCHECKED)

**Behavior:**
- Push to main → CI runs → ❌ Fails → GitHub shows warning, but push succeeded
- You still get email/notification
- Doesn't force PR workflow

**This is a middle ground** - keeps your current workflow but adds visibility.

---

## Testing the Protection

After setup, test it:

```bash
# 1. Make a breaking change
echo "console.log('break CI');" >> viewer/streaming.js
git add .
git commit -m "test: intentional CI break"

# 2. Try to push to main (should fail)
git push origin main
# Error: branch 'main' is protected

# 3. Push to feature branch instead
git checkout -b test/ci-protection
git push -u origin test/ci-protection

# 4. Create PR and watch it fail CI
gh pr create --title "Test CI protection" --body "This should fail"
# See red ❌ in PR - "Merge" button is blocked

# 5. Fix and push again
git revert HEAD
git push
# CI passes → "Merge" button turns green ✅

# 6. Merge and cleanup
gh pr merge --squash
git checkout main
git pull
git branch -d test/ci-protection
```

---

## Recommended Protection Level

**For solo developer (you):**

```
✅ Require status checks to pass (CI must pass)
☐ Require pull requests (optional - adds overhead)
✅ Require conversation resolution (ensures you read CI errors)
✅ Do not allow bypassing (prevents accidental force push)
```

**Reasoning:**
- You can still push directly to main
- But only if CI passes
- If CI fails, you'll see the error immediately in terminal
- Forces you to fix before deploying

**For team/public repo:**
```
✅ Require status checks to pass
✅ Require pull requests with 1 approval
✅ Require code owner review
✅ Do not allow bypassing
```

---

## Troubleshooting

### "I can't push to main anymore"
You need to create a PR. Protection is working as intended.

### "CI is taking too long, I need to push now"
1. Push to a branch without protection: `git push origin fix/urgent:urgent-hotfix`
2. Wait for CI
3. Merge via PR when ready

### "I want to disable protection temporarily"
Go to Settings → Branches → Edit rule → Delete or disable checkboxes

### "My status checks don't appear in the list"
Status checks only appear after they've run once. Push a commit to trigger CI, then add protection.

---

## Summary

**Before protection:**
- Fast iteration, but risky (broken code goes live)

**After protection:**
- Slower iteration, but safer (broken code never reaches users)

**Recommendation:** Start with **status checks only** (no PR requirement), upgrade to full protection if you get a team.

---

**Ready to set up? Go to:** https://github.com/red1oon/bim-ootb/settings/branches
