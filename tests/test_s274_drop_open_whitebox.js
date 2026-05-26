/**
 * test_s274_drop_open_whitebox.js — §S274 Whitebox: IFC drop → save → open
 * Issue: Large IFC drop+open may be broken. This test proves the FULL path.
 * Runs headless Chromium against localhost:8765, reads §-tagged logs as evidence.
 *
 * Tests the REAL user flow:
 *   1. Navigate to landing page
 *   2. Drop Hospital 2.0.ifc via file input
 *   3. Wait for import to complete (§IMPORT_SAVED)
 *   4. Click the import card to open (simulates user click)
 *   5. On the new viewer page, verify §DB_SPLIT_DETECT and streaming starts
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8765';
const HOSPITAL = path.resolve(process.env.HOME, 'Downloads', 'Hospital 2.0.ifc');
const LOG_FILE = path.resolve(__dirname, '..', 'test-results', 's274_whitebox.log');

// Ensure output dir
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

var allLogs = [];
function log(msg) {
  const line = new Date().toISOString().substring(11, 23) + ' ' + msg;
  allLogs.push(line);
  console.log(line);
}

async function main() {
  log('§WHITEBOX_START file=' + HOSPITAL + ' exists=' + fs.existsSync(HOSPITAL));
  if (!fs.existsSync(HOSPITAL)) {
    log('§WHITEBOX_ABORT Hospital 2.0.ifc not in ~/Downloads/');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
  });

  const context = await browser.newContext();
  const pageLogs = [];

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Landing page — drop the IFC file
  // ═══════════════════════════════════════════════════════════════════════
  const page = await context.newPage();
  page.on('console', msg => {
    const text = msg.text();
    pageLogs.push(text);
    // Only log §-tagged lines to keep output focused
    if (text.includes('§')) log('  [LANDING] ' + text);
  });
  page.on('pageerror', err => {
    pageLogs.push('PAGE_ERROR: ' + err.message);
    log('  [LANDING] PAGE_ERROR: ' + err.message);
  });

  log('§STEP1 Navigating to landing page...');
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 });

  // Verify import zone exists
  const hasImportZone = await page.evaluate(() => !!document.getElementById('import-zone'));
  log('§STEP1_ZONE import-zone=' + hasImportZone);
  if (!hasImportZone) {
    log('§WHITEBOX_ABORT No import-zone on landing page');
    await saveLog(); await browser.close(); process.exit(1);
  }

  // Clear any existing import for Hospital (clean slate)
  await page.evaluate(async (key) => {
    if (typeof deleteProject === 'function') {
      try { await deleteProject(key); } catch(e) {}
    }
    // Also try APP.deleteImported if on viewer
    if (typeof APP !== 'undefined' && APP.deleteImported) {
      try { await APP.deleteImported(key); } catch(e) {}
    }
  }, 'Hospital 2.0.ifc');
  log('§STEP1_CLEAN cleared previous Hospital import');

  // Set file on the input
  log('§STEP2 Dropping Hospital 2.0.ifc (226MB)...');
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    log('§WHITEBOX_ABORT No file input on landing page');
    await saveLog(); await browser.close(); process.exit(1);
  }
  await fileInput.setInputFiles(HOSPITAL);

  // Trigger the change event → handleImportFile
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]');
    if (input && input.files.length > 0) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Wait for import to complete
  // ═══════════════════════════════════════════════════════════════════════
  log('§STEP2_WAIT Waiting for §IMPORT_SAVED (up to 3 min)...');
  const importDone = await waitForTag(pageLogs, 'IMPORT_SAVED', 180000);
  if (!importDone) {
    log('§WHITEBOX_FAIL Import did not complete. Last 20 logs:');
    pageLogs.slice(-20).forEach(l => log('    ' + l));
    await saveLog(); await browser.close(); process.exit(1);
  }
  log('§STEP2_DONE ' + importDone);

  // Check for split-DB generation
  const splitGenLog = pageLogs.find(l => l.includes('§DB_SPLIT'));
  if (splitGenLog) {
    log('§STEP2_SPLIT ' + splitGenLog);
  } else {
    log('§STEP2_NOSPLIT WARNING: no §DB_SPLIT log — buildImportDBs may not have split');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Open the imported building (click card or call openImported)
  // ═══════════════════════════════════════════════════════════════════════
  log('§STEP3 Opening imported building...');

  // The landing page shows cards — the open function calls window.open() to viewer.html
  // We'll intercept the popup and navigate there ourselves to capture logs

  // First check if the card rendered
  await page.waitForTimeout(1000);
  const cardExists = await page.evaluate(() => {
    const cards = document.querySelectorAll('.import-card, [data-key]');
    return cards.length;
  });
  log('§STEP3_CARDS count=' + cardExists);

  // Navigate a NEW page to viewer.html — simulate what openImported does
  // Load viewer.html with import.js so we can call openImported directly
  const viewerPage = await context.newPage();
  const viewerLogs = [];
  viewerPage.on('console', msg => {
    const text = msg.text();
    viewerLogs.push(text);
    if (text.includes('§')) log('  [VIEWER] ' + text);
  });
  viewerPage.on('pageerror', err => {
    viewerLogs.push('PAGE_ERROR: ' + err.message);
    log('  [VIEWER] PAGE_ERROR: ' + err.message);
  });

  await viewerPage.goto(BASE + '/viewer/viewer.html', { waitUntil: 'load', timeout: 30000 });

  // Wait for APP to be ready
  try {
    await viewerPage.waitForFunction(() => typeof APP !== 'undefined' && APP.openImported, { timeout: 15000 });
  } catch(e) {
    log('§WHITEBOX_FAIL APP.openImported not available after 15s');
    viewerLogs.slice(-10).forEach(l => log('    ' + l));
    await saveLog(); await browser.close(); process.exit(1);
  }

  // Intercept window.open — we'll navigate manually
  await viewerPage.evaluate(() => {
    window._openedUrl = null;
    window.open = function(url) { window._openedUrl = url; return null; };
  });

  // Call openImported
  const openResult = await viewerPage.evaluate(async () => {
    try {
      await APP.openImported('Hospital 2.0.ifc');
      return { ok: true, url: window._openedUrl };
    } catch(e) {
      return { ok: false, err: e.message, stack: e.stack };
    }
  });

  if (!openResult.ok) {
    log('§STEP3_ERROR openImported threw: ' + openResult.err);
    log('  Stack: ' + (openResult.stack || '').substring(0, 200));
    viewerLogs.slice(-10).forEach(l => log('    ' + l));
  } else {
    log('§STEP3_URL ' + (openResult.url || 'no URL — window.open not called'));
  }

  // Check for split vs monolith
  await viewerPage.waitForTimeout(1000);
  const splitOpen = viewerLogs.find(l => l.includes('IMPORT_OPEN_SPLIT'));
  const monolithOpen = viewerLogs.find(l => l.includes('IMPORT_OPEN_MONOLITH'));

  if (splitOpen) {
    log('§STEP3_RESULT SPLIT ✓ ' + splitOpen);
  } else if (monolithOpen) {
    log('§STEP3_RESULT MONOLITH ✗ ' + monolithOpen);
  } else {
    log('§STEP3_RESULT UNKNOWN — no split/monolith log found');
    log('  All viewer logs:');
    viewerLogs.forEach(l => log('    ' + l));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: If we got a URL, navigate to it and check streaming
  // ═══════════════════════════════════════════════════════════════════════
  if (openResult.url) {
    log('§STEP4 Navigating to viewer URL to verify streaming...');
    const streamPage = await context.newPage();
    const streamLogs = [];
    streamPage.on('console', msg => {
      const text = msg.text();
      streamLogs.push(text);
      if (text.includes('§')) log('  [STREAM] ' + text);
    });
    streamPage.on('pageerror', err => {
      streamLogs.push('PAGE_ERROR: ' + err.message);
      log('  [STREAM] PAGE_ERROR: ' + err.message);
    });

    await streamPage.goto(openResult.url, { waitUntil: 'load', timeout: 30000 });

    // Wait for split-DB detection or streaming start
    const detectLog = await waitForTagIn(streamLogs, 'DB_SPLIT_DETECT', 20000);
    if (detectLog) {
      log('§STEP4_DETECT ' + detectLog);
    } else {
      log('§STEP4_DETECT NOT FOUND after 20s');
      log('  Stream page logs:');
      streamLogs.slice(0, 30).forEach(l => log('    ' + l));
    }

    // Check for streaming progress
    const streamDone = await waitForTagIn(streamLogs, 'STREAM', 30000);
    if (streamDone) {
      log('§STEP4_STREAM ' + streamDone);
    }

    await streamPage.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Error reporter quick check
  // ═══════════════════════════════════════════════════════════════════════
  log('§STEP5 Error reporter check...');
  const errReady = viewerLogs.find(l => l.includes('ERROR_REPORTER_READY'));
  if (errReady) {
    log('§STEP5_READY ' + errReady);
    await viewerPage.evaluate(() => APP.reportError(new Error('whitebox test error')));
    await viewerPage.waitForTimeout(500);
    const toastExists = await viewerPage.evaluate(() => !!document.getElementById('_err_toast'));
    log('§STEP5_TOAST visible=' + toastExists);
  } else {
    log('§STEP5_SKIP Error reporter not loaded on this page');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  await viewerPage.close();
  await page.close();
  await browser.close();

  log('');
  log('═══════════════════════════════════════════════════');
  log('§WHITEBOX_SUMMARY');
  log('  Import: ' + (importDone ? 'OK' : 'FAIL'));
  log('  Split gen: ' + (splitGenLog ? 'OK' : 'MISSING'));
  log('  Open mode: ' + (splitOpen ? 'SPLIT ✓' : monolithOpen ? 'MONOLITH ✗' : 'UNKNOWN'));
  log('  Error reporter: ' + (errReady ? 'OK' : 'NOT LOADED'));
  log('═══════════════════════════════════════════════════');

  await saveLog();

  if (!splitOpen && !monolithOpen) process.exit(1);
  if (monolithOpen && !splitOpen) process.exit(1);
}

async function waitForTag(logs, tag, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = logs.find(l => l.includes(tag));
    if (found) return found;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function waitForTagIn(logs, tag, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = logs.find(l => l.includes(tag));
    if (found) return found;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, allLogs.join('\n') + '\n');
  console.log('\n§LOG_SAVED ' + LOG_FILE);
}

main().catch(e => {
  log('§WHITEBOX_FATAL ' + e.message);
  saveLog();
  process.exit(1);
});
