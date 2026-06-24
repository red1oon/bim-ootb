// autobind_smoke.js — §AUTOBIND-SMOKE (wiring check, secondary to W-AUTOBIND node proof 16/16).
// Serves the real schedule editor + a real small building (SampleHouse), drives ⤓ Import P6 with the
// TOKENED (.bound.xer) fixture in headless Chromium and asserts the §B3 review surface is wired:
//   - checkbox ON  → autoBind runs, status shows "Pre-bound N elements", §SE_AUTOBIND log, bound>0
//   - checkbox OFF → opt-in respected: status says "tick auto-bind", no §SE_AUTOBIND
// Proves the UI seam (token file → adopt → autoBind → review status), NOT engine values (that's
// W-AUTOBIND). SampleHouse carries STR/ARC + IfcMember/IfcWall/IfcCovering/IfcFurniture → tokens resolve.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var FIX = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'Hospital_GW_Programme.bound.xer');
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
function check(n, c, d) { (c ? pass++ : fail++); console.log('§AUTOBIND-SMOKE ' + (c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  ' + d : '')); }

async function bootEditor(page) {
  await page.goto('http://localhost:8732/schedule_editor.html?db=buildings/sample.db', { waitUntil: 'load' });
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && !/Initialising|Loading/.test(s.textContent);
  }, { timeout: 45000 }).catch(function () {});
}

(async function () {
  await new Promise(function (res) { serve(8732, function (s) { global.__srv = s; res(); }); });
  var browser = await chromium.launch();

  // ── PHASE 1: checkbox ON (default) → autoBind runs ───────────────────────────────────────────────
  var page = await browser.newPage();
  var logs = [];
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await bootEditor(page);
  check('editor-booted', await page.$('#se-import-btn') !== null, 'import button present');
  check('autobind-checkbox-present', await page.$('#se-autobind-cb') !== null, '§B3 review-surface control present');
  var checkedByDefault = await page.$eval('#se-autobind-cb', function (e) { return e.checked; });
  check('autobind-default-on', checkedByDefault === true, 'auto-bind opt-in defaults ON');

  await page.setInputFiles('#se-import-file', FIX);
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 15000 }).catch(function () {});

  var statusTxt = await page.$eval('#se-status', function (e) { return e.textContent; });
  check('status-prebound', /Pre-bound \d+ elements/.test(statusTxt), statusTxt.slice(0, 120));

  var abLog = logs.filter(function (l) { return /§SE_AUTOBIND/.test(l); })[0] || '';
  var m = abLog.match(/bound=(\d+)/);
  var bound = m ? parseInt(m[1], 10) : 0;
  check('autobind-ran-bound>0', /§SE_AUTOBIND/.test(abLog) && bound > 0, abLog.slice(0, 90));
  var errs = logs.filter(function (l) { return /PAGEERROR/.test(l); });
  check('no-page-errors', errs.length === 0, errs.join(' | ').slice(0, 100));
  await page.close();

  // ── PHASE 2: checkbox OFF → opt-in respected, no autoBind ────────────────────────────────────────
  var page2 = await browser.newPage();
  var logs2 = [];
  page2.on('console', function (m) { logs2.push(m.text()); });
  await bootEditor(page2);
  await page2.uncheck('#se-autobind-cb');
  await page2.setInputFiles('#se-import-file', FIX);
  await page2.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && /Imported/.test(s.textContent);
  }, { timeout: 15000 }).catch(function () {});
  var statusTxt2 = await page2.$eval('#se-status', function (e) { return e.textContent; });
  check('optin-respected', /carry a bind token/.test(statusTxt2) && !/Pre-bound/.test(statusTxt2), statusTxt2.slice(0, 120));
  check('optin-no-autobind-log', logs2.filter(function (l) { return /§SE_AUTOBIND/.test(l); }).length === 0, 'autoBind not invoked when unchecked');
  await page2.close();

  await browser.close();
  global.__srv.close();
  console.log('\n§AUTOBIND-SMOKE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§AUTOBIND-SMOKE ERROR', e); try { global.__srv.close(); } catch (x) {} process.exit(1); });
