// foreign_import_smoke.js — §TM-IMPORT-SMOKE (wiring check, secondary to W-FGN node proof).
// §TM_P6_FOLD (2026-08-24): retargeted from the deleted schedule_editor.html tab to the Time
// Machine panel's in-panel ⇄ P6/MSP section — the same seam, on its new surface. Serves the real
// viewer + a real small building db, opens the TM panel (?tm=1), opens the P6/MSP section (which
// LAZY-LOADS foreign_schedule.js/schedule_diff.js — that load is itself under test), drives the
// hidden file input with the XER fixture, and asserts the imported schedule lands in APP.db and
// CPM auto-annotates (§S68 — the old tab's manual ▶ CPM, now automatic). Proves the UI seam is
// wired (button → lazy-load → file input → ForeignSchedule.adopt → refold), NOT engine values
// (that's W-FGN 22/22 in foreign_adopt_witness.js).
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var FIX = path.join(ROOT, 'tests', 'fixtures', 'Hospital_GW_Programme.xer');
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
function check(n, c, d) { (c ? pass++ : fail++); console.log('§TM-IMPORT-SMOKE ' + (c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  ' + d : '')); }

(async function () {
  await new Promise(function (res) { serve(8731, function (s) { global.__srv = s; res(); }); });
  var browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader']
  });
  var page = await browser.newPage();
  var logs = [];
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  // ?tm=1 — the shipped deep-link that opens the Time Machine once the building is rendered.
  await page.goto('http://localhost:8731/viewer.html?db=buildings/sample.db&tm=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () {
    var p = document.getElementById('time-machine-panel');
    return window.APP && window.APP.db && p && p.style.display !== 'none';
  }, { timeout: 120000 });
  check('tm-panel-open', true, 'TM panel visible with APP.db loaded');

  // The repurposed #tm-editor toggles the in-panel section — no new tab, no window.open.
  check('p6-button-present', await page.$('#tm-editor') !== null, '#tm-editor (⇄ P6/MSP) present');
  var boxClosedBefore = await page.$eval('#tm-p6-box', function (e) { return !e.classList.contains('open'); });
  check('p6-box-collapsed-default', boxClosedBefore, 'section collapsed before first click');
  var eagerLoaded = await page.evaluate(function () { return !!(window.ForeignSchedule || window.ScheduleDiff); });
  check('interop-not-eager', !eagerLoaded, 'ForeignSchedule/ScheduleDiff NOT loaded before the section opens');

  await page.click('#tm-editor');
  await page.waitForFunction(function () { return window.ForeignSchedule && window.ScheduleDiff; }, { timeout: 20000 });
  check('lazy-load-on-open', true, 'both interop modules present after opening the section');
  check('p6-box-open', await page.$eval('#tm-p6-box', function (e) { return e.classList.contains('open'); }), 'section expanded');

  // drive the hidden file input with the XER fixture
  await page.setInputFiles('#tm-p6-file', FIX);
  await page.waitForFunction(function () {
    var s = document.getElementById('tm-p6-out');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 20000 }).catch(function () {});

  var outTxt = await page.$eval('#tm-p6-out', function (e) { return e.textContent; });
  check('status-imported', /Imported XER/.test(outTxt) && /14 activities/.test(outTxt), outTxt.slice(0, 90));

  var importLog = logs.filter(function (l) { return /§TM_IMPORT_P6 /.test(l); })[0] || '';
  check('import-log', /schedule=GW-HOSP/.test(importLog), importLog.slice(0, 90));

  // the adopted schedule is in the TM's OWN db (the whole point of the fold — no second copy)
  var m = importLog.match(/schedule=(\S+)/);
  var schedId = m ? m[1] : 'GW-HOSP';
  var rowCounts = await page.evaluate(function (sid) {
    return {
      tasks: window.APP.dbQuery('SELECT COUNT(*) FROM tasks WHERE schedule_id=?', [sid])[0][0],
      links: window.APP.dbQuery('SELECT COUNT(*) FROM task_sequences')[0][0]
    };
  }, schedId);
  check('adopted-into-app-db', rowCounts.tasks > 0, 'tasks for ' + schedId + ' in APP.db: ' + rowCounts.tasks + ' (links total ' + rowCounts.links + ')');

  // §S68 — CPM is AUTO-annotated on import (the old tab's manual ▶ CPM button, retired)
  var cpmLog = logs.filter(function (l) { return /§GANTT_CPM_ANNOTATE /.test(l) && l.indexOf(schedId) >= 0; })[0] || '';
  check('cpm-auto-annotated', /critical=\d+/.test(cpmLog), cpmLog.slice(0, 110));

  var errs = logs.filter(function (l) { return /PAGEERROR/.test(l); });
  check('no-page-errors', errs.length === 0, errs.join(' | ').slice(0, 120));

  await browser.close();
  global.__srv.close();
  console.log('\n§TM-IMPORT-SMOKE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§TM-IMPORT-SMOKE ERROR', e); try { global.__srv.close(); } catch (x) {} process.exit(1); });
