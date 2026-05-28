/**
 * §S284b Browser proof — opens /tmp/BIM-OOTB.html in real Chromium from file://.
 * Issue: 6MB web-ifc as JSON string literal breaks HTML parser.
 * Fix: <script type="text/plain" id="webifc-src"> stores inert text.
 *
 * This test PROVES the packaged HTML loads in a real browser with zero errors.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT = '/tmp/BIM-OOTB.html';

(async () => {
  if (!fs.existsSync(OUTPUT)) {
    console.log('FAIL — /tmp/BIM-OOTB.html not found. Run test_s284b_full_package.js first.');
    process.exit(1);
  }

  let pass = 0, fail = 0;
  function check(id, ok, detail) {
    if (ok) { pass++; console.log('  PASS ' + id); }
    else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
  }

  const errors = [];
  const warnings = [];
  const logs = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect ALL console output
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (msg.type() === 'error') errors.push(text);
    if (msg.type() === 'warning') warnings.push(text);
  });

  // Collect page errors (uncaught exceptions, SyntaxErrors)
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  console.log('\n§S284b_BROWSER Opening ' + OUTPUT + ' from file://');
  const fileUrl = 'file://' + OUTPUT;
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait a bit for async scripts to settle
  await page.waitForTimeout(3000);

  console.log('\n§S284b_BROWSER Page loaded — checking state');

  // ── 1. Zero page errors (SyntaxError, etc.) ──
  check('1.1 zero pageerror (SyntaxError/uncaught)',
    pageErrors.length === 0,
    pageErrors.length ? pageErrors.join(' | ') : '');

  // ── 2. _STANDALONE flag set ──
  const isStandalone = await page.evaluate(() => window._STANDALONE === true);
  check('2.1 window._STANDALONE is true', isStandalone);

  // ── 3. webifc-src DOM element exists ──
  const webifcEl = await page.evaluate(() => {
    var el = document.getElementById('webifc-src');
    if (!el) return null;
    return {
      tagName: el.tagName,
      type: el.getAttribute('type'),
      contentLength: el.textContent.length
    };
  });
  check('3.1 webifc-src element exists', !!webifcEl);
  if (webifcEl) {
    check('3.2 webifc-src is a SCRIPT element', webifcEl.tagName === 'SCRIPT');
    check('3.3 webifc-src type is text/plain', webifcEl.type === 'text/plain');
    check('3.4 webifc-src textContent > 5MB (6MB web-ifc)',
      webifcEl.contentLength > 5000000,
      'size=' + webifcEl.contentLength);
    check('3.5 webifc-src textContent contains WebIFC/IfcAPI signature',
      await page.evaluate(() => {
        var t = document.getElementById('webifc-src').textContent;
        return t.indexOf('IfcAPI') >= 0 || t.indexOf('WebIFC') >= 0;
      }));
  }

  // ── 4. _MANIFEST_SNAPSHOT loaded ──
  const hasManifest = await page.evaluate(() => !!window._MANIFEST_SNAPSHOT);
  check('4.1 _MANIFEST_SNAPSHOT present', hasManifest);

  // ── 5. _WORKER_SOURCES loaded ──
  const workerKeys = await page.evaluate(() => {
    if (!window._WORKER_SOURCES) return null;
    return Object.keys(window._WORKER_SOURCES);
  });
  check('5.1 _WORKER_SOURCES present', !!workerKeys);
  if (workerKeys) {
    check('5.2 has import_worker.js', workerKeys.indexOf('import_worker.js') >= 0);
    check('5.3 has ifc_export_worker.js', workerKeys.indexOf('ifc_export_worker.js') >= 0);
  }

  // ── 6. _SQL_WASM_JS and _SQL_WASM_B64 loaded ──
  const sqlState = await page.evaluate(() => ({
    hasJs: typeof window._SQL_WASM_JS === 'string' && window._SQL_WASM_JS.length > 10000,
    hasB64: typeof window._SQL_WASM_B64 === 'string' && window._SQL_WASM_B64.length > 800000
  }));
  check('6.1 _SQL_WASM_JS loaded (>10KB)', sqlState.hasJs);
  check('6.2 _SQL_WASM_B64 loaded (>800KB)', sqlState.hasB64);

  // ── 7. NO window._WEBIFC_SRC (old approach removed) ──
  const noOldVar = await page.evaluate(() => typeof window._WEBIFC_SRC === 'undefined');
  check('7.1 window._WEBIFC_SRC does NOT exist (replaced by DOM)', noOldVar);

  // ── 8. _createWorker function exists and can read DOM ──
  const workerTest = await page.evaluate(() => {
    if (typeof _createWorker !== 'function') return { exists: false };
    // Simulate what _createWorker does for import_worker.js
    var el = document.getElementById('webifc-src');
    if (!el) return { exists: true, elFound: false };
    var content = el.textContent;
    return {
      exists: true,
      elFound: true,
      contentSize: content.length,
      hasIfcAPI: content.indexOf('IfcAPI') >= 0 || content.indexOf('WebIFC') >= 0
    };
  });
  check('8.1 _createWorker function exists', workerTest.exists);
  if (workerTest.exists) {
    check('8.2 _createWorker can find webifc-src element', workerTest.elFound);
    if (workerTest.elFound) {
      check('8.3 DOM textContent readable (size=' + workerTest.contentSize + ')',
        workerTest.contentSize > 5000000);
      check('8.4 DOM content has web-ifc signature', workerTest.hasIfcAPI);
    }
  }

  // ── 9. Health check skipped (standalone) ──
  const healthSkipped = logs.some(l => l.indexOf('§HEALTH_CHECK skip') >= 0);
  check('9.1 health check skipped in standalone mode', healthSkipped);

  // ── 12. ACTUAL WORKER CREATION — prove _createWorker builds a Blob Worker ──
  console.log('\n§S284b_BROWSER Creating real worker from embedded sources...');
  const workerResult = await page.evaluate(() => {
    return new Promise(function(resolve) {
      try {
        // Call the real _createWorker with import_worker.js key
        var w = _createWorker('viewer/import_worker.js?v=8');
        if (!w) return resolve({ created: false, reason: 'null worker' });

        var workerLogs = [];
        var timeout = setTimeout(function() {
          w.terminate();
          resolve({ created: true, logs: workerLogs, timedOut: true });
        }, 15000);

        w.onmessage = function(msg) {
          workerLogs.push(JSON.stringify(msg.data).slice(0, 100));
        };
        w.onerror = function(err) {
          workerLogs.push('ERROR: ' + (err.message || String(err)));
          clearTimeout(timeout);
          w.terminate();
          resolve({ created: true, logs: workerLogs, error: true });
        };

        // Don't send an IFC file — just verify the worker starts and web-ifc loads
        // The worker runs importScripts at top level, so if web-ifc is embedded
        // correctly, we'll see §WORKER_LOADED in console. Give it time to init.
        setTimeout(function() {
          clearTimeout(timeout);
          w.terminate();
          resolve({ created: true, logs: workerLogs, settled: true });
        }, 8000);
      } catch(e) {
        resolve({ created: false, reason: e.message });
      }
    });
  });

  check('12.1 worker created successfully', workerResult.created,
    workerResult.reason || '');

  // Check the §STANDALONE_WORKER and §STANDALONE_WEBIFC logs appeared
  const standaloneWorkerLog = logs.some(l => l.indexOf('§STANDALONE_WORKER') >= 0);
  check('12.2 §STANDALONE_WORKER log emitted (Blob URL created)', standaloneWorkerLog);

  const standaloneWebifcLog = logs.some(l => l.indexOf('§STANDALONE_WEBIFC') >= 0);
  check('12.3 §STANDALONE_WEBIFC log emitted (web-ifc prepended)', standaloneWebifcLog);

  // Check worker-side logs: §WORKER_START and §WORKER_LOADED (web-ifc IIFE parsed)
  const workerStartLog = logs.some(l => l.indexOf('§WORKER_START') >= 0);
  check('12.4 §WORKER_START log from worker (worker is running)', workerStartLog);

  const workerLoadedLog = logs.some(l => l.indexOf('§WORKER_LOADED') >= 0);
  check('12.5 §WORKER_LOADED web-ifc IIFE loaded (WebIFC available in worker)', workerLoadedLog);

  if (!workerResult.created) {
    console.log('  Worker creation failed: ' + workerResult.reason);
  }
  if (workerResult.error) {
    console.log('  Worker error logs: ' + workerResult.logs.join(' | '));
  }

  // ── 10. Console errors check ──
  // Filter out expected errors (file:// CORS for external resources is expected)
  const realErrors = errors.filter(e => {
    // Ignore CORS/network errors for external resources (expected from file://)
    if (/net::ERR_FILE_NOT_FOUND/.test(e)) return false;
    if (/Failed to load resource/.test(e)) return false;
    if (/favicon/.test(e)) return false;
    return true;
  });
  const realPageErrors = pageErrors.filter(e => {
    // Ignore fetch failures for relative URLs (expected from file://)
    if (/fetch/.test(e) && /file:\/\//.test(e)) return false;
    return true;
  });

  check('10.1 zero real console errors',
    realErrors.length === 0,
    realErrors.length ? realErrors.slice(0, 3).join(' | ') : '');
  check('10.2 zero real page errors (SyntaxError etc)',
    realPageErrors.length === 0,
    realPageErrors.length ? realPageErrors.slice(0, 3).join(' | ') : '');

  // ── 11. DOM structure sanity ──
  const domCheck = await page.evaluate(() => ({
    hasBody: !!document.body,
    bodyChildren: document.body ? document.body.children.length : 0,
    scriptCount: document.querySelectorAll('script').length,
    plainScriptCount: document.querySelectorAll('script[type="text/plain"]').length,
    title: document.title || '(none)'
  }));
  check('11.1 document.body exists', domCheck.hasBody);
  check('11.2 body has children', domCheck.bodyChildren > 0, 'count=' + domCheck.bodyChildren);
  check('11.3 exactly 1 type=text/plain script', domCheck.plainScriptCount === 1,
    'found=' + domCheck.plainScriptCount);

  // ── Summary ──
  console.log('\n§S284b_BROWSER_LOGS (' + logs.length + ' total):');
  logs.filter(l => l.startsWith('§')).forEach(l => console.log('  ' + l));

  if (errors.length) {
    console.log('\n§S284b_BROWSER_ERRORS (' + errors.length + '):');
    errors.forEach(e => console.log('  ERR: ' + e.slice(0, 120)));
  }
  if (pageErrors.length) {
    console.log('\n§S284b_BROWSER_PAGEERRORS (' + pageErrors.length + '):');
    pageErrors.forEach(e => console.log('  PAGEERR: ' + e.slice(0, 120)));
  }

  await browser.close();

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
  if (fail > 0) process.exit(1);
})();
