/**
 * §S284b SANDBOX — end-to-end offline IFC import from packaged HTML.
 * Issue: Does the 6.8MB BIM-OOTB.html actually import an IFC from file://?
 *
 * This test proves the FULL pipeline:
 *   file:// open → _STANDALONE → _createWorker (Blob) → web-ifc from DOM
 *   → Worker parses IFC → postMessage(done) → elements extracted
 *
 * Prerequisite: /tmp/BIM-OOTB.html must exist (run test_s284b_full_package.js first).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT = '/tmp/BIM-OOTB.html';
const IFC_FILE = '/tmp/test_wall.ifc';

(async () => {
  if (!fs.existsSync(OUTPUT)) {
    console.log('FAIL — /tmp/BIM-OOTB.html not found. Run test_s284b_full_package.js first.');
    process.exit(1);
  }
  if (!fs.existsSync(IFC_FILE)) {
    console.log('FAIL — /tmp/test_wall.ifc not found.');
    process.exit(1);
  }

  let pass = 0, fail = 0;
  function check(id, ok, detail) {
    if (ok) { pass++; console.log('  PASS ' + id); }
    else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
  }

  const logs = [];
  const errors = [];
  const pageErrors = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    var text = msg.text();
    logs.push(text);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  // ── Step 1: Open packaged HTML from file:// ──
  console.log('\n§S284b_SANDBOX Opening ' + OUTPUT + ' from file://');
  await page.goto('file://' + OUTPUT, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  check('1.1 page loads with zero page errors',
    pageErrors.length === 0,
    pageErrors.length ? pageErrors.join(' | ') : '');

  check('1.2 _STANDALONE is true',
    await page.evaluate(() => window._STANDALONE === true));

  check('1.3 webifc-src DOM element present',
    await page.evaluate(() => {
      var el = document.getElementById('webifc-src');
      return el && el.textContent.length > 5000000;
    }));

  // ── Step 2: Read IFC file and trigger import via handleImportFile ──
  console.log('\n§S284b_SANDBOX Triggering IFC import...');

  var ifcBuffer = fs.readFileSync(IFC_FILE);
  var ifcBase64 = ifcBuffer.toString('base64');
  var ifcSize = ifcBuffer.length;
  console.log('  IFC file: ' + IFC_FILE + ' (' + ifcSize + ' bytes)');

  // Inject the IFC file as a Blob and call handleImportFile directly
  var importResult = await page.evaluate(async function(b64) {
    return new Promise(function(resolve) {
      // Decode base64 to ArrayBuffer
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes], { type: 'application/octet-stream' });
      var file = new File([blob], 'test_wall.ifc', { type: 'application/octet-stream' });

      // Track worker messages via console logs
      var timeout = setTimeout(function() {
        resolve({ timedOut: true, logs: window._s284b_logs || [] });
      }, 30000);

      // Intercept import completion
      window._s284b_logs = [];
      var origConsoleLog = console.log;
      console.log = function() {
        var msg = Array.prototype.join.call(arguments, ' ');
        window._s284b_logs.push(msg);
        origConsoleLog.apply(console, arguments);
        // Detect completion or error
        if (msg.indexOf('§IMPORT_DONE') >= 0 || msg.indexOf('§WORKER_DONE') >= 0 ||
            msg.indexOf('import-status') >= 0 || msg.indexOf('§PARSE_START') >= 0) {
          // Keep listening — don't resolve yet
        }
      };

      // Check if handleImportFile exists
      if (typeof handleImportFile !== 'function') {
        clearTimeout(timeout);
        resolve({ error: 'handleImportFile not found' });
        return;
      }

      // Call the real import handler
      try {
        handleImportFile(file);
      } catch(e) {
        clearTimeout(timeout);
        resolve({ error: 'handleImportFile threw: ' + e.message });
        return;
      }

      // Wait up to 25s for worker pipeline to complete
      // Poll for completion markers in the logs
      var pollInterval = setInterval(function() {
        var allLogs = window._s284b_logs;
        var hasWorkerDone = allLogs.some(function(l) {
          return l.indexOf('§WORKER_DONE') >= 0 || l.indexOf('§IMPORT_COMPLETE') >= 0 ||
                 l.indexOf('§IMPORT_SAVED') >= 0 || l.indexOf('§IMPORT_AUTO_OPEN') >= 0;
        });
        var hasWorkerError = allLogs.some(function(l) {
          return l.indexOf('§PARSE_FAIL') >= 0 || l.indexOf('Worker error') >= 0;
        });
        var hasWorkerStart = allLogs.some(function(l) {
          return l.indexOf('§WORKER_START') >= 0;
        });
        var hasWebIfcLoaded = allLogs.some(function(l) {
          return l.indexOf('§WORKER_LOADED') >= 0;
        });
        var hasParseStart = allLogs.some(function(l) {
          return l.indexOf('§PARSE_START') >= 0;
        });

        if (hasWorkerDone || hasWorkerError) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          console.log = origConsoleLog;
          resolve({
            started: hasWorkerStart,
            webifcLoaded: hasWebIfcLoaded,
            parseStarted: hasParseStart,
            done: hasWorkerDone,
            error: hasWorkerError,
            logs: allLogs
          });
        }
      }, 500);
    });
  }, ifcBase64);

  // ── Step 3: Validate import results ──
  console.log('\n§S284b_SANDBOX Import result analysis');

  if (importResult.error) {
    check('3.0 handleImportFile callable', false, importResult.error);
  } else {
    check('3.1 Worker started (§WORKER_START)',
      importResult.started || logs.some(l => l.indexOf('§WORKER_START') >= 0));

    check('3.2 web-ifc loaded in Worker (§WORKER_LOADED)',
      importResult.webifcLoaded || logs.some(l => l.indexOf('§WORKER_LOADED') >= 0));

    check('3.3 IFC parse started (§PARSE_START)',
      importResult.parseStarted || logs.some(l => l.indexOf('§PARSE_START') >= 0));

    check('3.4 Import completed (§IMPORT_SAVED)',
      importResult.done || logs.some(l => l.indexOf('§IMPORT_SAVED') >= 0));

    check('3.5 No parse failures',
      !importResult.error,
      importResult.error ? 'Worker reported error' : '');

    check('3.6 Not timed out', !importResult.timedOut);
  }

  // ── Step 3b: Verify extraction results from logs ──
  var elemLog = logs.find(l => l.indexOf('§ELEMENTS_FOUND') >= 0) || '';
  var elemMatch = elemLog.match(/count=(\d+)/);
  check('3.7 elements extracted (count >= 1)',
    elemMatch && parseInt(elemMatch[1]) >= 1,
    elemLog || 'no §ELEMENTS_FOUND log');

  var dbLog = logs.find(l => l.indexOf('§DB_BUILD') >= 0) || '';
  check('3.8 DB built with elements',
    dbLog.indexOf('elements=') >= 0,
    dbLog || 'no §DB_BUILD log');

  var savedLog = logs.find(l => l.indexOf('§IMPORT_SAVED') >= 0) || '';
  check('3.9 saved to IndexedDB (key=test_wall.ifc)',
    savedLog.indexOf('test_wall.ifc') >= 0,
    savedLog || 'no §IMPORT_SAVED log');

  var sqlLog = logs.find(l => l.indexOf('§STANDALONE_SQL') >= 0) || '';
  check('3.10 SQLite loaded from embedded source',
    sqlLog.indexOf('inline') >= 0,
    sqlLog || 'no §STANDALONE_SQL log');

  // ── Step 4: Check §-tagged logs for evidence ──
  console.log('\n§S284b_SANDBOX §-tagged log evidence');

  var sLogs = logs.filter(l => l.startsWith('§') || l.indexOf('§') >= 0);
  console.log('  §-tagged logs (' + sLogs.length + '):');
  sLogs.forEach(l => console.log('    ' + l.slice(0, 120)));

  check('4.1 §STANDALONE_WORKER emitted',
    logs.some(l => l.indexOf('§STANDALONE_WORKER') >= 0));
  check('4.2 §STANDALONE_WEBIFC emitted',
    logs.some(l => l.indexOf('§STANDALONE_WEBIFC') >= 0));

  // ── Step 5: Verify no leaks — no unexpected external fetches ──
  console.log('\n§S284b_SANDBOX Leak check');

  // In standalone from file://, the only allowed external fetches are:
  // - CDN WASM (web-ifc Init locateFile callback) — HTTPS, expected
  // - Nothing else should go to network
  var fetchErrors = errors.filter(e =>
    /Fetch API cannot load file/.test(e) &&
    !/locales/.test(e)  // locale fetch failures are expected and handled
  );
  check('5.1 no unexpected file:// fetch leaks',
    fetchErrors.length === 0,
    fetchErrors.length ? fetchErrors.join(' | ') : '');

  // Verify _STANDALONE guards are working
  check('5.2 health check skipped',
    logs.some(l => l.indexOf('§HEALTH_CHECK skip') >= 0));
  check('5.3 community fetch skipped',
    logs.some(l => l.indexOf('§COMMUNITY skip') >= 0));

  // ── Summary ──
  if (errors.length) {
    console.log('\n§S284b_SANDBOX Console errors (' + errors.length + '):');
    errors.forEach(e => console.log('  ERR: ' + e.slice(0, 120)));
  }
  if (pageErrors.length) {
    console.log('\n§S284b_SANDBOX Page errors (' + pageErrors.length + '):');
    pageErrors.forEach(e => console.log('  PAGEERR: ' + e.slice(0, 120)));
  }

  await browser.close();

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
  if (fail > 0) process.exit(1);
})();
