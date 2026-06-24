// foreign_import_smoke.js — §SE-IMPORT-SMOKE (wiring check, secondary to W-FGN node proof).
// Serves the real editor + a real small building db, drives the ⤓ Import P6 control in headless
// Chromium with the XER fixture, asserts the imported WBS/links render. Proves the UI seam is wired
// (button → file input → ForeignSchedule.adopt → re-render), NOT engine values (that's W-FGN 22/22).
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var FIX = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'Hospital_GW_Programme.xer');
var BLD = '/home/red1/bim-compiler/deploy/buildings/SampleHouse_extracted.db';
var chromium = require('/home/red1/bim-ootb/tests/node_modules/playwright').chromium;

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css' };

function serve(port, cb) {
  var srv = http.createServer(function (req, res) {
    var u = decodeURIComponent(req.url.split('?')[0]);
    var file = u === '/buildings/sample.db' ? BLD : path.join(VIEWER, u.replace(/^\//, ''));
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
function check(n, c, d) { (c ? pass++ : fail++); console.log('§SE-IMPORT-SMOKE ' + (c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  ' + d : '')); }

(async function () {
  await new Promise(function (res) { serve(8731, function (s) { global.__srv = s; res(); }); });
  var browser = await chromium.launch();
  var page = await browser.newPage();
  var logs = [];
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:8731/schedule_editor.html?db=buildings/sample.db', { waitUntil: 'load' });
  // wait for the editor to finish booting (status leaves "Loading"/"Initialising")
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && !/Initialising|Loading/.test(s.textContent);
  }, { timeout: 45000 }).catch(function () {});
  check('editor-booted', await page.$('#se-import-btn') !== null, 'import button present');

  // drive the hidden file input with the XER fixture
  await page.setInputFiles('#se-import-file', FIX);
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 15000 }).catch(function () {});

  var statusTxt = await page.$eval('#se-status', function (e) { return e.textContent; });
  check('status-imported', /Imported XER/.test(statusTxt) && /14 activities/.test(statusTxt), statusTxt.slice(0, 90));

  // the WBS pane should now show the imported phase names + activities
  var wbsTxt = await page.$eval('#se-wbs', function (e) { return e.textContent; });
  check('wbs-rendered-phases', /Substructure/.test(wbsTxt) && /Commissioning/.test(wbsTxt), 'phases visible');
  check('wbs-rendered-activity', /Footings & Foundations/.test(wbsTxt) && /HVAC Ductwork/.test(wbsTxt), 'activities visible');

  // dependencies pane shows links; compute CPM lights the critical path
  await page.click('#se-cpm-btn');
  await page.waitForTimeout(400);
  var cpmTxt = await page.$eval('#se-cpm-out', function (e) { return e.textContent; });
  check('cpm-ran', /\d/.test(cpmTxt), 'cpm-out=' + cpmTxt.slice(0, 60));

  var importLog = logs.filter(function (l) { return /§SE_IMPORT_P6/.test(l); })[0] || '';
  check('import-log', /schedule=GW-HOSP/.test(importLog), importLog.slice(0, 80));
  var errs = logs.filter(function (l) { return /PAGEERROR/.test(l); });
  check('no-page-errors', errs.length === 0, errs.join(' | ').slice(0, 100));

  await browser.close();
  global.__srv.close();
  console.log('\n§SE-IMPORT-SMOKE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§SE-IMPORT-SMOKE ERROR', e); try { global.__srv.close(); } catch (x) {} process.exit(1); });
