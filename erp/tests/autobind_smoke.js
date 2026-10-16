// autobind_smoke.js — §TM-AUTOBIND-SMOKE (wiring check, secondary to W-AUTOBIND node proof 16/16).
// §TM_P6_FOLD (2026-08-24): retargeted from the deleted schedule_editor.html tab to the Time
// Machine panel's in-panel ⇄ P6/MSP section — same §B3 seam, new surface. Serves the real viewer +
// a real small building (SampleHouse), opens the TM panel (?tm=1), opens the P6/MSP section (which
// lazy-loads the interop modules), drives the hidden file input with the TOKENED (.bound.xer)
// fixture and asserts the §B3 review surface is wired:
//   - checkbox ON  → autoBind runs, output shows "Pre-bound N elements", §TM_AUTOBIND log, bound>0
//   - checkbox OFF → opt-in respected: output says "tick auto-bind", no §TM_AUTOBIND
// Proves the UI seam (token file → adopt → autoBind → review status), NOT engine values (that's
// W-AUTOBIND). SampleHouse carries STR/ARC + IfcMember/IfcWall/IfcCovering/IfcFurniture → tokens resolve.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var FIX = path.join(ROOT, 'tests', 'fixtures', 'Hospital_GW_Programme.bound.xer');
var BLD = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var chromium = require('/home/red1/bim-ootb/tests/node_modules/playwright').chromium;

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css' };

function serve(port, cb) {
  var srv = http.createServer(function (req, res) {
    var u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
    // viewer/ first (the page's own base), then repo root — viewer.html loads ../erp/* and
    // ../common/* siblings, which the real deployment serves; a 404 here fakes a page error.
    var file = u === 'buildings/sample.db' ? BLD : path.join(ROOT, 'viewer', u);
    if (u !== 'buildings/sample.db' && !fs.existsSync(file)) file = path.join(ROOT, u);
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*' });
      res.end(buf);
    });
  });
  srv.listen(port, function () { cb(srv); });
}

var pass = 0, fail = 0;
function check(n, c, d) { (c ? pass++ : fail++); console.log('§TM-AUTOBIND-SMOKE ' + (c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  ' + d : '')); }

// Boot the viewer with the TM open, then open the P6/MSP section (triggers the lazy module load).
async function bootTmP6(page) {
  await page.goto('http://localhost:8732/viewer.html?db=buildings/sample.db&tm=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () {
    var p = document.getElementById('time-machine-panel');
    return window.APP && window.APP.db && p && p.style.display !== 'none';
  }, { timeout: 120000 });
  await page.click('#tm-editor');
  await page.waitForFunction(function () { return window.ForeignSchedule && window.ScheduleDiff; }, { timeout: 20000 });
}

(async function () {
  await new Promise(function (res) { serve(8732, function (s) { global.__srv = s; res(); }); });
  var browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader']
  });

  // ── PHASE 1: checkbox ON (default) → autoBind runs ───────────────────────────────────────────────
  var page = await browser.newPage();
  var logs = [];
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await bootTmP6(page);
  check('p6-section-booted', await page.$('#tm-p6-import') !== null, 'import button present in TM panel');
  check('autobind-checkbox-present', await page.$('#tm-p6-autobind') !== null, '§B3 review-surface control present');
  var checkedByDefault = await page.$eval('#tm-p6-autobind', function (e) { return e.checked; });
  check('autobind-default-on', checkedByDefault === true, 'auto-bind opt-in defaults ON');

  await page.setInputFiles('#tm-p6-file', FIX);
  await page.waitForFunction(function () {
    var s = document.getElementById('tm-p6-out');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 20000 }).catch(function () {});

  var outTxt = await page.$eval('#tm-p6-out', function (e) { return e.textContent; });
  check('status-prebound', /Pre-bound \d+ elements/.test(outTxt), outTxt.slice(0, 120));

  var abLog = logs.filter(function (l) { return /§TM_AUTOBIND/.test(l); })[0] || '';
  var m = abLog.match(/bound=(\d+)/);
  var bound = m ? parseInt(m[1], 10) : 0;
  check('autobind-ran-bound>0', /§TM_AUTOBIND/.test(abLog) && bound > 0, abLog.slice(0, 90));
  var errs = logs.filter(function (l) { return /PAGEERROR/.test(l); });
  check('no-page-errors', errs.length === 0, errs.join(' | ').slice(0, 100));
  await page.close();

  // ── PHASE 2: checkbox OFF → opt-in respected, no autoBind ────────────────────────────────────────
  var page2 = await browser.newPage();
  var logs2 = [];
  page2.on('console', function (m) { logs2.push(m.text()); });
  await bootTmP6(page2);
  await page2.uncheck('#tm-p6-autobind');
  await page2.setInputFiles('#tm-p6-file', FIX);
  await page2.waitForFunction(function () {
    var s = document.getElementById('tm-p6-out');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 20000 }).catch(function () {});
  var outTxt2 = await page2.$eval('#tm-p6-out', function (e) { return e.textContent; });
  check('optin-respected', /carry a bind token/.test(outTxt2) && !/Pre-bound/.test(outTxt2), outTxt2.slice(0, 120));
  check('optin-no-autobind-log', logs2.filter(function (l) { return /§TM_AUTOBIND/.test(l); }).length === 0, 'autoBind not invoked when unchecked');
  await page2.close();

  await browser.close();
  global.__srv.close();
  console.log('\n§TM-AUTOBIND-SMOKE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§TM-AUTOBIND-SMOKE ERROR', e); try { global.__srv.close(); } catch (x) {} process.exit(1); });
