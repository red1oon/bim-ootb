## Test Suite for BIM OOTB

### Quick Start

```bash
# 1. Install dependencies
cd tests
npm install
npx playwright install chromium

# 2. Download test data (run once)
./setup-test-data.sh

# 3. Run tests
npx playwright test --grep @fast          # Fast structural tests (~60s)
npx playwright test 41-streaming-contract # Streaming contract validation
npx playwright test                       # Full suite (~5min)
```

---

## Test Types

### 1. **Playwright E2E Tests** (`specs/*.spec.js`)
Black-box browser tests for real user workflows.

**When to run:**
- Before every commit (at least `@fast` tests)
- After modifying streaming, picking, or filter logic
- Before deploying to production

**Key tests:**
- `01-viewer-load.spec.js` - DB load, streaming, element count
- `41-streaming-contract.spec.js` - **Metadata routing validation (NEW)**
- `s274-golden-path.spec.js` - IFC drop → parse → stream → save
- `16-instanced-perf.spec.js` - InstancedMesh performance

**Test data:**
- Duplex building DBs (1.1MB extracted + 117B library) - download via `setup-test-data.sh`
- Vogel IFC (924KB) - in `fixtures/` for import tests

### 2. **Whitebox Node Tests** (`test_*.js`, `whitebox_regression.js`)
Direct module testing without browser, for:
- Grid kinematics, BOM logic, verb expansion
- DB integrity checks (split DB, orphaned hashes)
- ERP parser, document canvas, globe search

**Run:**
```bash
node whitebox_regression.js
node test_grid_kinematics.js
```

### 3. **Audit Scripts** (`audit_*.js`)
Static analysis for:
- Service worker precache manifest
- Import worker safety (no DOM access)
- Script tag integrity

**Run in CI:**
```bash
node audit_sw_precache.js
node audit_script_tags.js
```

---

## Streaming Contract Validation

**Why it exists:** The streaming system routes elements to either `BatchedMesh` (single instances) or `InstancedMesh` (≥2 instances). 16 files depend on metadata being correctly populated in `_batchMeta` or `_instanceMeta`. Contract violations break Time Machine, picking, storey filters, and walk mode.

**What it tests:**
1. Every non-merged element has a `guidMap` entry
2. No orphaned GUIDs (metadata without guidMap)
3. InstancedMesh has ≥2 instances (not 0 or 1)
4. Metadata count matches streamed element count

**How it works:**
- White-box logging in `streaming.js` runs `§CONTRACT_CHECK` after final flush
- Playwright test (`41-streaming-contract.spec.js`) observes console for `§CONTRACT_FAIL`
- Fails CI if contract violations detected

**Run during dev:**
```bash
# Terminal 1: Start local server
cd .. && python3 -m http.server 8080

# Terminal 2: Open browser with DevTools
# Load a building, watch console for:
# §CONTRACT_CHECK batch=500 instanced=1200 guidMap=1700 streamed=1700 orphans=0

# Before commit:
cd tests && npx playwright test 41-streaming-contract
```

---

## Test Data Setup

### Option 1: Use Existing IFC (For Import Testing)

Test file already in repo:
- `fixtures/Vogel_Gesamt_upgraded.ifc` (924KB, IFC2x3)

Tests using this:
- `07-import-ifc.spec.js` - IFC import pipeline
- `s274-golden-path.spec.js` - Full drop-to-save flow
- `15-drop-zone-wizard-e2e.spec.js` - Import wizard

### Option 2: Download Pre-built DBs (For Streaming/Contract Testing)

```bash
./setup-test-data.sh
```

Downloads:
- `Duplex_extracted.db` (1.1MB) - Element metadata, hierarchy
- `Duplex_library.db` (117B) - Geometry BLOBs

Tests using this:
- `01-viewer-load.spec.js` - Default test building
- `41-streaming-contract.spec.js` - Contract validation
- Most other specs that call `openViewer()`

### Why DBs are not in Git

Building databases are `.gitignore`'d because:
- Production DBs hosted on OCI Object Storage (Always Free tier)
- Sizes range from 117B (Duplex_library) to 500MB (Terminal_geo)
- Test DBs are fetched on-demand via setup script

---

## CI/CD Integration

### GitHub Actions (`.github/workflows/ci.yml`)

**Runs on:** Every `git push`

**Jobs:**
1. **fast-checks** - Syntax, audit scripts, whitebox tests (no browser)
2. **golden-path** - Playwright E2E for IFC drop → stream → save

**To add contract test to CI:**

Edit `.github/workflows/ci.yml`:

```yaml
- name: Download test data
  working-directory: tests
  run: ./setup-test-data.sh

- name: Streaming contract validation
  working-directory: tests
  run: npx playwright test 41-streaming-contract --project=desktop
```

**Notifications:**
- ✓ Green check on GitHub commit page
- ✗ Red X + email if tests fail
- View logs: `https://github.com/red1oon/bim-ootb/actions`

---

## Adding New Tests

### 1. Playwright E2E Test

```javascript
// tests/specs/99-my-feature.spec.js
const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');

test.describe('My Feature', () => {
  test('does something @fast', async ({ page }) => {
    await openViewer(page);
    // Your test logic...
  });
});
```

Run: `npx playwright test 99-my-feature`

### 2. Whitebox Node Test

```javascript
// tests/test_my_module.js
function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, e.message);
    process.exit(1);
  }
}

test('my feature works', () => {
  const result = myFunction(input);
  if (result !== expected) throw new Error('Mismatch');
});
```

Run: `node tests/test_my_module.js`

---

## Troubleshooting

### "No test DBs found"
Run `./setup-test-data.sh` to download from OCI.

### "SQLite busy/locked"
Close any open DB connections in browser DevTools → Application → Storage.

### "WebGL not available in headless"
Playwright config already includes `--use-gl=angle --use-angle=swiftshader`. If still failing, run headed: `npx playwright test --headed`.

### "Contract check not appearing"
White-box logging only runs at **final flush** (when `streamIdx >= streamQueue.length`). Wait for "DONE" in streaming HUD.

### "Tests fail locally but pass in CI"
Check browser cache. Clear: DevTools → Application → Clear storage → Clear site data.

---

## Test Philosophy

**White-box logging > Playwright for active dev**
- Instant feedback during coding
- Rich diagnostic info (exact counts, state)
- Works in production for user bug reports

**Playwright = Safety net for CI/CD**
- Catches regressions before deploy
- Documents expected behavior
- Automated, no manual console checking

**Streaming contract test is hybrid**
- Validates white-box logging output
- Runs in CI to prevent broken commits
- Observes §-tagged console messages (black-box observation of white-box checks)

---

## Files

| File | Purpose |
|------|---------|
| `specs/*.spec.js` | Playwright E2E tests (46 files, 5.2K lines) |
| `test_*.js` | Whitebox Node tests (unit/integration) |
| `whitebox_regression.js` | DB integrity regression suite |
| `audit_*.js` | Static analysis scripts |
| `helpers/` | Shared Playwright helpers (viewer, console capture, DOM) |
| `fixtures/` | Test data (IFC files) |
| `playwright.config.js` | Playwright settings (3 workers, 60s timeout) |
| `setup-test-data.sh` | Download test DBs from OCI |

---

## Performance

| Suite | Duration | When to Run |
|-------|----------|-------------|
| `@fast` tests | ~60s | Before every commit |
| Golden path | ~30s | CI/CD on push |
| Full suite | ~5min | Nightly, before release |
| Whitebox regression | ~5s | CI/CD on push |

Keep tests fast by:
- Using `@fast` tag for critical path tests
- Parallelizing independent tests (3 workers)
- Minimal test data (Duplex is smallest valid building)

---

## Learn More

- [Playwright docs](https://playwright.dev)
- [Streaming contract lockdown](../viewer/streaming.js#L650) - See §S280d comments
- [Test spec audit](audit_specs.js) - Validates @fast tags, prevents drift
